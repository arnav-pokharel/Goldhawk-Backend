const express = require("express");
const router = express.Router();

const {
  create_link_token,
  exchange_public_token,
  handlePlaidCallback,
} = require("../../controllers/founder/founder_plaidController");

// Create link token for Plaid Link
router.post("/plaid/create_link_token", create_link_token);

// Exchange public_token -> access_token
router.post("/plaid/exchange_public_token", exchange_public_token);

// OAuth redirect callback from bank (re-route back to frontend)
router.get("/oauth/plaid/callback", handlePlaidCallback);

module.exports = router;
