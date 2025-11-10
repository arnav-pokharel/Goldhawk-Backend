"use strict";

const { PrismaClient } = require("@prisma/client");
const { APP_NAME } = require("../../utils/appConfig");

const prisma = new PrismaClient();

function plaidBaseUrl() {
  const env = (process.env.PLAID_ENV || "sandbox").toLowerCase();
  if (env === "production") return "https://production.plaid.com";
  if (env === "development") return "https://development.plaid.com";
  return "https://sandbox.plaid.com";
}

function requirePlaidConfig() {
  const client_id = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!client_id || !secret) throw new Error("Plaid credentials are not configured");
  return { client_id, secret };
}

async function create_link_token(req, res) {
  try {
    const uid = req.body?.uid || req.query?.uid;
    if (!uid) return res.status(400).json({ error: "uid required" });

    const { client_id, secret } = requirePlaidConfig();
    const redirectUri = process.env.PLAID_REDIRECT_URI || `${process.env.BACKEND_ORIGIN || `http://localhost:${process.env.PORT || 10000}`}/founder/oauth/plaid/callback`;

    const body = {
      client_id,
      secret,
      user: { client_user_id: uid },
      client_name: process.env.PLAID_CLIENT_NAME || APP_NAME,
      products: ["auth", "transactions"],
      country_codes: ["US"],
      language: "en",
      redirect_uri: redirectUri,
    };

    const resp = await fetch(`${plaidBaseUrl()}/link/token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Plaid-Version": process.env.PLAID_VERSION || "2020-09-14" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(502).json({ error: "Plaid link token failed", details: text });
    }

    const json = await resp.json();
    return res.json({ link_token: json.link_token });
  } catch (err) {
    console.error("create_link_token error", err);
    return res.status(500).json({ error: err.message || "Failed to create link token" });
  }
}

async function exchange_public_token(req, res) {
  try {
    const uid = req.body?.uid;
    const public_token = req.body?.public_token;
    if (!uid || !public_token) return res.status(400).json({ error: "uid and public_token required" });

    const { client_id, secret } = requirePlaidConfig();
    const resp = await fetch(`${plaidBaseUrl()}/item/public_token/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Plaid-Version": process.env.PLAID_VERSION || "2020-09-14" },
      body: JSON.stringify({ client_id, secret, public_token }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(502).json({ error: "Plaid token exchange failed", details: text });
    }

    const json = await resp.json();
    const access_token = json.access_token;
    const item_id = json.item_id;

    await prisma.access_be.upsert({
      where: { uid_provider: { uid, provider: "other" } },
      update: {
        authorized: true,
        access_token,
        provider_account_id: item_id || null,
        comment: "plaid",
        updated_at: new Date(),
      },
      create: {
        uid,
        provider: "other",
        provider_account_id: item_id || null,
        authorized: true,
        access_token,
        comment: "plaid",
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("exchange_public_token error", err);
    return res.status(500).json({ error: err.message || "Failed to exchange public token" });
  }
}

function handlePlaidCallback(req, res) {
  const oauth_state_id = req.query?.oauth_state_id;
  const frontend = process.env.FRONTEND_URL || "http://www.lunaseed.app";
  const redirectTo = `${frontend}/founder/dashboard/validate/access${oauth_state_id ? `?plaid_oauth_state_id=${encodeURIComponent(oauth_state_id)}` : ""}`;
  return res.redirect(302, redirectTo);
}

module.exports = {
  create_link_token,
  exchange_public_token,
  handlePlaidCallback,
};
