const express = require("express");
const router = express.Router();
const step1 = require("../../controllers/founder/founder_step1Controller");

router.get("/:uid/step1", step1.getStep1);
router.post("/:uid/step1", step1.createStep1);
router.patch("/:uid/step1/:id", step1.updateStep1);
router.delete("/:uid/step1/:id", step1.deleteStep1);

module.exports = router;
