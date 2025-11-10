const express = require("express");
const {
  startGithubOAuth,
  handleGithubCallback,
} = require("../../controllers/founder/founder_githubController");

const router = express.Router();

router.get("/oauth/github", startGithubOAuth);
router.get("/oauth/github/callback", handleGithubCallback);

module.exports = router;
