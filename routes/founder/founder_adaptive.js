
const express = require("express");
const auth = require("../../middleware/auth");
const {
  generateAdaptiveQuestions,
  getAdaptiveQuestions,
  saveAdaptiveAnswers,
} = require("../../controllers/founder/founder_adaptiveController");

const router = express.Router();

router.post("/:uid/validation/adaptive/generate", auth, generateAdaptiveQuestions);
router.get("/:uid/validation/adaptive", auth, getAdaptiveQuestions);
router.post("/:uid/validation/adaptive/answers", auth, saveAdaptiveAnswers);

module.exports = router;
