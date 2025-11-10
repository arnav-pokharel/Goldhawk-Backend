require("dotenv").config();
const fs = require("fs");
const docusign = require("docusign-esign");

async function testAuth() {
  try {
    // Debug all env vars starting with DOCUSIGN
    console.log("🔎 Env keys loaded:", Object.keys(process.env).filter(k => k.startsWith("DOCUSIGN")));
    console.log("🔎 DOCUSIGN_PRIVATE_KEY_PATH value:", process.env.DOCUSIGN_PRIVATE_KEY_PATH);

    if (!process.env.DOCUSIGN_PRIVATE_KEY_PATH) {
      throw new Error("DOCUSIGN_PRIVATE_KEY_PATH is undefined. Check your .env file.");
    }

    // Read private key from path
    const privateKey = fs.readFileSync(process.env.DOCUSIGN_PRIVATE_KEY_PATH);

    const jwtLifeSec = 10 * 60; // 10 minutes
    const scopes = ["signature", "impersonation"];

    const dsApiClient = new docusign.ApiClient();
    dsApiClient.setOAuthBasePath("account-d.docusign.com"); // sandbox auth server

    // Request JWT user token
    const results = await dsApiClient.requestJWTUserToken(
      process.env.DOCUSIGN_INTEGRATION_KEY,
      process.env.DOCUSIGN_USER_ID,
      scopes,
      privateKey,
      jwtLifeSec
    );

    const accessToken = results.body.access_token;
    console.log("✅ Got access token:", accessToken.slice(0, 20) + "...");

    // Get user info
    const userInfo = await dsApiClient.getUserInfo(accessToken);
    console.log("✅ User Info:", JSON.stringify(userInfo, null, 2));

    const account = userInfo.accounts.find(a => a.isDefault === "true");
    console.log("✅ Account Base URI:", account.baseUri);
    console.log("✅ Account ID:", account.accountId);

  } catch (err) {
    console.error("❌ DocuSign Auth Failed:", err.message);
    if (err.stack) console.error(err.stack);
  }
}

testAuth();
