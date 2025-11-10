const express = require("express");
const router = express.Router();
const {
  signupFounder,
  verifyOtp,
  checkEmailExists,
  checkSession,
} = require("../../controllers/founder/founder_signupController");
const { getOnboardingStatus } = require("../../controllers/founder/founder_signupController");


// Signup → send OTP
router.post("/signup", signupFounder);

// Verify OTP
router.post("/verify-otp", verifyOtp);

// Check if email exists
router.get("/exists", checkEmailExists);

// Check session cookie
router.get("/session", checkSession);
router.get("/onboarding-status", getOnboardingStatus);

module.exports = router;
