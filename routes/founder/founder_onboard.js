const express = require("express");
const router = express.Router();
const multer = require("multer");

// 👉 pick ONE of these requires depending on your folder layout
// const onboard = require("../../controllers/founder_onboardController");
const onboard = require("../../controllers/founder/founder_onboardController");

// Multer for in-memory file handling
const upload = multer({ storage: multer.memoryStorage() });

// Early sanity check so you get a clear error if something is missing
[
  "getStep1", "createStep1", "updateStep1", "deleteStep1",
  "getStep2", "saveStep2", "getStep3", "saveStep3",
  "getReview", "submitStep4", "uploadAvatar"
].forEach((n) => {
  if (typeof onboard[n] !== "function") {
    throw new TypeError(`Expected controller "${n}" to be a function, got ${typeof onboard[n]}. Check your require path and exports.`);
  }
});

// ---- STEP 1
router.get("/:uid/step1", onboard.getStep1);
router.post("/:uid/step1", onboard.createStep1);
router.patch("/:uid/step1/:id", onboard.updateStep1);
router.delete("/:uid/step1/:id", onboard.deleteStep1);
router.post("/:uid/step1/:id/avatar", upload.single('avatar'), onboard.uploadAvatar);

// ---- STEP 2
router.get("/:uid/step2", onboard.getStep2);
router.post("/:uid/step2", onboard.saveStep2);

// ---- STEP 3
router.get("/:uid/step3", onboard.getStep3);
router.get("/:uid/step1/:id/avatar", onboard.getAvatar); // Expose GET route for avatar retrieval
router.post("/:uid/step3", onboard.saveStep3);

// ---- REVIEW + SUBMIT
router.get("/:uid/review", onboard.getReview);
router.post("/:uid/submit", onboard.submitStep4);

module.exports = router;
