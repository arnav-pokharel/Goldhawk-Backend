// routes/founder/founder_pitch.js
const express = require("express");
const router = express.Router();
const founderPitchController = require("../../controllers/founder/founder_pitchController");
const multer = require("multer");
const auth = require("../../middleware/auth"); // ✅ FIXED

const upload = multer({ storage: multer.memoryStorage() });

// Upload pitch videos + deck
router.post(
  "/upload",
  auth,
  upload.fields([
    { name: "pitch1", maxCount: 1 },
    { name: "pitch2", maxCount: 1 },
    { name: "pitch3", maxCount: 1 },
    { name: "deck", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  founderPitchController.uploadPitch
);

// View pitch data
router.get("/view", auth, founderPitchController.viewPitch);

// Secure streaming endpoint (videos/pdf through backend with Range support)
router.get("/stream/:slot", auth, founderPitchController.streamPitch);

// Update descriptions only
router.post("/update-descriptions", auth, founderPitchController.updateDescriptions);

module.exports = router;
