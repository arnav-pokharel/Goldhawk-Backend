const express = require("express");
const { generatePresignedUrls } = require("../../controllers/founder/founder_storageController");

const router = express.Router();

router.post("/storage/presign", generatePresignedUrls);

module.exports = router;
