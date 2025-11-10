const express = require("express");
const app = express();

app.use(express.json());

// mount the new route
const safeBoardConsentRoutes = require("./routes/startup_pipeline_legal_safe_board_consent");
app.use("/startup_pipeline_legal_safe_board_consent", safeBoardConsentRoutes);

module.exports = app;