const express = require("express");
const router = express.Router();
const step2 = require("../../controllers/founder/founder_step2Controller");

router.get("/:uid/step2", step2.getStep2);
router.post("/:uid/step2", step2.saveStep2);

module.exports = router;
