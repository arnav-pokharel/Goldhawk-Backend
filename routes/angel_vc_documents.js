const express = require('express');
const router = express.Router();
const angel_auth = require('../../../middleware/auth');
const {
  angel_getDocuments,
  angel_generateUploadURL,
  angel_saveDocument
} = require('../../../controllers/angel_vc_documents');

// Protected routes
router.get('/angel_documents', angel_auth, angel_getDocuments);
router.post('/angel_documents/generate-upload-url', angel_auth, angel_generateUploadURL);
router.post('/angel_documents/save', angel_auth, angel_saveDocument);

module.exports = router;