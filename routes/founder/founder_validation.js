const express = require("express");
const {
  saveValidationData,
  generateValidationReport,
  getValidationByType,
  getValidationProgress,
} = require("../../controllers/founder/founder_validationController");

const router = express.Router();

router.get("/:uid/validation/progress", getValidationProgress);
router.post("/:uid/validation", saveValidationData);
router.post("/:uid/validate", generateValidationReport);
router.get("/validation", getValidationByType);

module.exports = router;
