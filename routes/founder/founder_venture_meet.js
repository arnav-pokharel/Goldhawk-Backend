const express = require("express");
const router = express.Router();
const founderVentureMeetController = require("../../controllers/founder/founder_venture_meetController");
const { authenticateToken } = require("../../controllers/angel_investor/middleware/auth");

// Protect routes
router.use(authenticateToken);

// Start a meeting
router.post("/meet/start/:deal_id", founderVentureMeetController.startMeeting);

// End a meeting
router.post("/meet/end/:deal_id", founderVentureMeetController.endMeeting);

// Get all meetings for a deal
router.get("/meet/:deal_id", founderVentureMeetController.getMeetings);

module.exports = router;

