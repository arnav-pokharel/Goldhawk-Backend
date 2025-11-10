const express = require("express");
const {
  saveCompanyProfile,
  getCompanyProfile,
  getCompanyDashboard,
  updateCompanyLogo,
  updateCompanyDetails,
} = require("../../controllers/founder/founder_companyController");

const router = express.Router();

router.post("/company", saveCompanyProfile);
router.get("/company", getCompanyProfile);

// Company dashboard API used by Frontend
router.get("/:uid/company-dashboard", getCompanyDashboard);
router.post("/:uid/company-logo", updateCompanyLogo);
router.post("/:uid/company-update", updateCompanyDetails);

module.exports = router;
