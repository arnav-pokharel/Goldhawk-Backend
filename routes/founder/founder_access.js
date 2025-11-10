const express = require("express");
const auth = require("../../middleware/auth");
const {
  getValidationAccess,
  saveValidationAccess,
} = require("../../controllers/founder/founder_accessController");

const router = express.Router();

router.get("/:uid/validation/access", auth, getValidationAccess);
router.post("/:uid/validation/access", auth, saveValidationAccess);

module.exports = router;
