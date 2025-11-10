const express = require("express");
const {
  startGitlabOAuth,
  handleGitlabCallback,
} = require("../../controllers/founder/founder_gitlabController");

const router = express.Router();

router.get("/oauth/gitlab", startGitlabOAuth);
router.get("/oauth/gitlab/callback", handleGitlabCallback);

module.exports = router;
