const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const callController = require("../controllers/vc-firm/associates/calls/callController");

router.use(authenticate);

router.post("/start", callController.startCall);
router.post("/end", callController.endCall);
router.patch("/", callController.updateCallRecord);
router.get("/:dealId/history", callController.getHistory);
router.post("/turn", callController.issueTurnCredentials);

module.exports = router;
