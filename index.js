const express = require("express");
const app = express();

app.use(express.json());

// Mount the SAFE board consent route
const safeBoardConsentRoutes = require("./routes/startup_pipeline_legal_safe_board_consent");
app.use("/startup_pipeline_legal_safe_board_consent", safeBoardConsentRoutes);

// Start the server (if not already present)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});