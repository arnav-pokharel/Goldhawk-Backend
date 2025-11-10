const express = require("express");
const router = express.Router();
const multer = require("multer");
const founderDocumentController = require("../../controllers/founder/founder_documentController");
const auth = require("../../middleware/auth");

// Multer in-memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Upload overview
router.post(
  "/documents/upload/overview/:uid",
  auth,
  upload.single("file"),
  founderDocumentController.uploadOverview
);

// Upload other docs
router.post(
  "/documents/upload/other/:uid",
  auth,
  upload.single("file"),
  founderDocumentController.uploadOther
);

// Get signed URL
router.get(
  "/documents/view/:uid/:type/:filename",
  auth,
  founderDocumentController.getSignedUrl
);

// Secure streaming proxy (prevents URL sharing)
router.get(
  "/documents/stream/:uid/:type/:filename",
  auth,
  founderDocumentController.streamDocument
);

// List documents for current founder
router.get(
  "/documents/list/:uid",
  auth,
  founderDocumentController.listDocuments
);

module.exports = router;
