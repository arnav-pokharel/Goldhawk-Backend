const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/founder/startup_desController");

// Company dashboard data
router.get("/:uid/company-dashboard", ctrl.getCompanyDashboard);
router.post("/:uid/company-dashboard", ctrl.updateCompanyDashboard);

// Logo update via base64 data URL
router.post("/:uid/company-logo", ctrl.updateCompanyLogo);

module.exports = router;
