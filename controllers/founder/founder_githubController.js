"use strict";

const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const {
  markProviderAuthorized,
  encodeOAuthState,
  decodeOAuthState,
} = require("./access_section");
const { APP_NAME, COOKIE_PREFIX } = require("../../utils/appConfig");

const prisma = new PrismaClient();

const PROVIDER_ID = "github";
const DEFAULT_SCOPE = process.env.GITHUB_SCOPE || "repo user:email";

function getBackendOrigin() {
  return process.env.BACKEND_ORIGIN || `http://localhost:${process.env.PORT || 10000}`;
}

function getCallbackUrl() {
  return `${getBackendOrigin().replace(/\/$/, "")}/founder/oauth/github/callback`;
}

function sanitizeColumn(column) {
  return column === "access_sc" ? column : "access_sc";
}

function buildCloseWindowResponse(message, isError = false, provider = PROVIDER_ID) {
  const safeMessage = (message || "").replace(/[<>]/g, (m) => (m === "<" ? "&lt;" : "&gt;"));
  const eventType = `${COOKIE_PREFIX}:oauth`;
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${APP_NAME} OAuth</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 2rem; background: #f8fafc; color: #0f172a; }
      .card { max-width: 420px; margin: auto; background: #fff; border-radius: 12px; padding: 1.5rem; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12); }
      .card h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
      .card p { font-size: 0.95rem; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${isError ? "Authorization Failed" : "Authorization Complete"}</h1>
      <p>${safeMessage}</p>
    </div>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage({ type: "${eventType}", provider: "${provider}", success: ${!isError} }, "*");
        }
      } catch (error) {
        console.warn("postMessage failed", error);
      }
      setTimeout(() => { window.close(); }, 1200);
    </script>
  </body>
</html>`;
  return { html, isError };
}

function startGithubOAuth(req, res) {
  const uid = typeof req.query.uid === "string" ? req.query.uid : "";
  if (!uid) return res.status(400).send("uid required");

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return res.status(500).send("GitHub OAuth is not configured.");

  const statePayload = {
    uid,
    column: sanitizeColumn(req.query.column),
    nonce: crypto.randomUUID(),
    ts: Date.now(),
  };
  const state = encodeOAuthState(statePayload);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUrl(),
    scope: DEFAULT_SCOPE,
    state,
  });

  return res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}

async function handleGithubCallback(req, res) {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const stateParam = typeof req.query.state === "string" ? req.query.state : "";
  if (!code) return res.status(400).send("code required");

  const decodedState = decodeOAuthState(stateParam);
  if (!decodedState || !decodedState.uid) {
    const { html, isError } = buildCloseWindowResponse("We could not verify this GitHub authorization request.", true);
    return res.status(isError ? 400 : 200).send(html);
  }

  const uid = decodedState.uid;
  const column = sanitizeColumn(decodedState.column);

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const { html, isError } = buildCloseWindowResponse("GitHub OAuth credentials are not configured.", true);
    return res.status(isError ? 500 : 200).send(html);
  }

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: getCallbackUrl(),
        state: stateParam,
      }),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      console.error("GitHub token exchange failed", tokenResponse.status, text);
      const { html, isError } = buildCloseWindowResponse("GitHub did not accept the authorization code.", true);
      return res.status(isError ? 502 : 200).send(html);
    }

    const tokenJson = await tokenResponse.json();
    if (!tokenJson || !tokenJson.access_token) {
      console.error("GitHub token payload missing access_token", tokenJson);
      const errorMsg = tokenJson?.error_description || tokenJson?.error || "GitHub returned an unexpected response.";
      const { html, isError } = buildCloseWindowResponse(errorMsg, true);
      return res.status(isError ? 502 : 200).send(html);
    }

    const context = await persistGithubAuthorization(uid, column, tokenJson);
    const successMessage = context.accountLogin
      ? `GitHub account ${context.accountLogin} is now connected. You can close this window.`
      : "GitHub authorization completed. You can close this window.";
    const { html } = buildCloseWindowResponse(successMessage, false);
    return res.status(200).send(html);
  } catch (error) {
    console.error("handleGithubCallback error", error);
    const { html, isError } = buildCloseWindowResponse("Unexpected error while completing GitHub authorization.", true);
    return res.status(isError ? 500 : 200).send(html);
  }
}

async function persistGithubAuthorization(uid, column, tokenPayload) {
  const accessToken = tokenPayload.access_token;
  const tokenType = tokenPayload.token_type || "bearer";
  const scope = tokenPayload.scope || DEFAULT_SCOPE;

  let accountLogin = null;
  let accountId = null;
  let accountUrl = null;

  try {
    const profileResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": process.env.GITHUB_APP_NAME || APP_NAME,
        Accept: "application/json",
      },
    });

    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      accountLogin = profile?.login || null;
      accountId = profile?.id || null;
      accountUrl = profile?.html_url || null;
    } else {
      console.warn("GitHub profile request failed", profileResponse.status);
    }
  } catch (error) {
    console.warn("Failed to fetch GitHub profile", error);
  }

  const providerData = {
    access_token: accessToken,
    token_type: tokenType,
    scope,
  };
  if (accountId != null) { providerData.account_id = accountId; providerData.github_user_id = accountId; }
  if (accountLogin) { providerData.account_login = accountLogin; providerData.github_username = accountLogin; }
  if (accountUrl) providerData.account_url = accountUrl;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.founder_validation_access.findUnique({ where: { uid } });
    const currentSection = existing?.[column];
    const updatedSection = markProviderAuthorized(currentSection, PROVIDER_ID, providerData);

    const now = new Date();
    const data = { [column]: updatedSection, updated_at: now };

    if (existing) {
      await tx.founder_validation_access.update({ where: { uid }, data });
    } else {
      await tx.founder_validation_access.create({
        data: { uid, [column]: updatedSection, created_at: now, updated_at: now },
      });
    }
  });

  return { accountLogin };
}

module.exports = { startGithubOAuth, handleGithubCallback };
