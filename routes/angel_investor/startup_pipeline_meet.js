const express = require("express");
const router = express.Router();
const startupPipelineMeetController = require("../controllers/investor/startup_pipeline_meetController");
const { authenticateToken } = require("../controllers/angel_investor/middleware/auth");

// Protect routes
router.use(authenticateToken);

// Start a meeting
router.post("/investor/pipeline/meet/start/:deal_id", startupPipelineMeetController.startMeeting);

// End a meeting
router.post("/investor/pipeline/meet/end/:deal_id", startupPipelineMeetController.endMeeting);

// Get all meetings for a deal
router.get("/investor/pipeline/meet/:deal_id", startupPipelineMeetController.getMeetings);

module.exports = router;

