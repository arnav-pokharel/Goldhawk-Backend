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

const PROVIDER_ID = "gitlab";
const BASE_URL = (process.env.GITLAB_BASE_URL || "https://gitlab.com").replace(/\/$/, "");
const DEFAULT_SCOPE = process.env.GITLAB_SCOPE || "read_user read_api";

function getBackendOrigin() {
  return process.env.BACKEND_ORIGIN || `http://localhost:${process.env.PORT || 10000}`;
}

function getCallbackUrl() {
  return `${getBackendOrigin().replace(/\/$/, "")}/founder/oauth/gitlab/callback`;
}

function authorizeUrl() {
  return `${BASE_URL}/oauth/authorize`;
}

function tokenUrl() {
  return `${BASE_URL}/oauth/token`;
}

function userApiUrl() {
  return `${BASE_URL}/api/v4/user`;
}

function sanitizeColumn(column) {
  return column === "access_sc" ? "access_sc" : "access_sc";
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

function startGitlabOAuth(req, res) {
  const uid = typeof req.query.uid === "string" ? req.query.uid : "";
  if (!uid) return res.status(400).send("uid required");

  const clientId = process.env.GITLAB_CLIENT_ID;
  if (!clientId) return res.status(500).send("GitLab OAuth is not configured.");

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
    response_type: "code",
    scope: DEFAULT_SCOPE,
    state,
  });

  return res.redirect(`${authorizeUrl()}?${params.toString()}`);
}

async function handleGitlabCallback(req, res) {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const stateParam = typeof req.query.state === "string" ? req.query.state : "";
  if (!code) return res.status(400).send("code required");

  const decodedState = decodeOAuthState(stateParam);
  if (!decodedState || !decodedState.uid) {
    const { html, isError } = buildCloseWindowResponse("We could not verify this GitLab authorization request.", true);
    return res.status(isError ? 400 : 200).send(html);
  }

  const uid = decodedState.uid;
  const column = sanitizeColumn(decodedState.column);

  const clientId = process.env.GITLAB_CLIENT_ID;
  const clientSecret = process.env.GITLAB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const { html, isError } = buildCloseWindowResponse("GitLab OAuth credentials are missing.", true);
    return res.status(isError ? 500 : 200).send(html);
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: getCallbackUrl(),
    });

    const tokenResponse = await fetch(tokenUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      console.error("GitLab token exchange failed", tokenResponse.status, text);
      const { html, isError } = buildCloseWindowResponse("GitLab did not accept the authorization code.", true);
      return res.status(isError ? 502 : 200).send(html);
    }

    const tokenJson = await tokenResponse.json();
    if (!tokenJson || !tokenJson.access_token) {
      console.error("GitLab token payload missing access_token", tokenJson);
      const msg = tokenJson?.error_description || tokenJson?.error || "GitLab returned an unexpected response.";
      const { html, isError } = buildCloseWindowResponse(msg, true);
      return res.status(isError ? 502 : 200).send(html);
    }

    const context = await persistGitlabAuthorization(uid, column, tokenJson);
    const account = context.accountUsername;
    const successMessage = account
      ? `GitLab account ${account} is now connected. You can close this window.`
      : "GitLab authorization completed. You can close this window.";

    const { html } = buildCloseWindowResponse(successMessage, false);
    return res.status(200).send(html);
  } catch (error) {
    console.error("handleGitlabCallback error", error);
    const { html, isError } = buildCloseWindowResponse("Unexpected error while completing GitLab authorization.", true);
    return res.status(isError ? 500 : 200).send(html);
  }
}

async function persistGitlabAuthorization(uid, column, tokenPayload) {
  const accessToken = tokenPayload.access_token;
  const refreshToken = tokenPayload.refresh_token || null;
  const tokenType = tokenPayload.token_type || "bearer";
  const scope = tokenPayload.scope || DEFAULT_SCOPE;
  const expiresInRaw = tokenPayload.expires_in;
  const expiresIn = typeof expiresInRaw === "number" ? expiresInRaw : parseInt(expiresInRaw, 10);
  const expiresAt = Number.isFinite(expiresIn) ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  let accountUsername = null;
  let accountId = null;
  let accountUrl = null;

  try {
    const profileResponse = await fetch(userApiUrl(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      accountUsername = profile?.username || profile?.name || null;
      accountId = profile?.id || null;
      accountUrl = profile?.web_url || null;
    } else {
      console.warn("GitLab profile request failed", profileResponse.status);
    }
  } catch (error) {
    console.warn("Failed to fetch GitLab profile", error);
  }

  const providerData = {
    access_token: accessToken,
    token_type: tokenType,
    scope,
  };

  if (refreshToken) providerData.refresh_token = refreshToken;
  if (Number.isFinite(expiresIn)) providerData.expires_in = expiresIn;
  if (expiresAt) providerData.expires_at = expiresAt;
  if (accountId != null) { providerData.account_id = accountId; providerData.gitlab_user_id = accountId; }
  if (accountUsername) { providerData.account_username = accountUsername; providerData.gitlab_username = accountUsername; }
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

  return { accountUsername };
}

module.exports = { startGitlabOAuth, handleGitlabCallback };
