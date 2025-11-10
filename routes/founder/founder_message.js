const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const founderMessagesController = require("../../controllers/founder/founder_messageController");

router.get("/", auth, founderMessagesController.getMessages);
router.post("/", auth, founderMessagesController.sendMessage);

module.exports = router;
