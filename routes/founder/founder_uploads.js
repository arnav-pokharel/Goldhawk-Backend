const express = require("express");
const {
  saveUploadMetadata,
  getUploadsByFounder,
} = require("../../controllers/founder/founder_uploadController");

const router = express.Router();

router.post("/:uid/uploads", saveUploadMetadata);
router.get("/:uid/uploads", getUploadsByFounder);

module.exports = router;
