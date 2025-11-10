const express = require("express");
const router = express.Router();
const controller = require("../../controllers/founder/founder_board_safeController");

// Founder sends invite
router.post("/:uid/send-sign-request", controller.sendSignRequest);

// External board member loads document by token
router.get("/sign/:token", controller.getBoardConsentByToken);

// External board member submits signature
router.post("/sign/:token", controller.submitSignature);

// Founder inline sign
router.post("/:uid/founder-sign", controller.founderSign);

// Lock/unlock the board (persisted)
router.post("/:uid/lock-board", controller.lockBoard);

module.exports = router;
