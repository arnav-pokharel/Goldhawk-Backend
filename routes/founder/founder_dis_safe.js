const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getDiscountSafe,
  saveDiscountSafe,
} = require("../../controllers/founder/founder_dis_safeController");

// Fetch Discount SAFE signature JSON (preview)
router.get("/:uid/safe/discount", auth, getDiscountSafe);

// Save Discount SAFE signature JSON (write-once)
router.post("/:uid/safe/discount/sign", auth, saveDiscountSafe);

module.exports = router;

