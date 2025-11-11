require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { setIO } = require("./services/socket");

const app = express();
const httpServer = createServer(app);

const defaultOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3005",
  "http://localhost:9002",
  "https://www.goldhawk-capital.com",
];

const configuredOrigins =
  process.env.CORS_ORIGIN || process.env.CORS_ALLOWED_ORIGINS
    ? (process.env.CORS_ORIGIN || process.env.CORS_ALLOWED_ORIGINS)
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean)
    : defaultOrigins;
  : defaultOrigins;
const allowedOrigins = configuredOrigins.length === 0 ? defaultOrigins : configuredOrigins;
const allowAllOrigins = allowedOrigins.includes("*");

const corsOptions = {
  origin: allowAllOrigins ? true : allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

const io = new Server(httpServer, {
  cors: {
    origin: allowAllOrigins ? "*" : allowedOrigins,
    credentials: true,
    methods: corsOptions.methods,
  },
});

setIO(io);

io.on("connection", socket => {
  console.log("a user connected");

  socket.on("authenticate", data => {
    console.log("authenticate event received:", data);
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET || process.env.SESSION_COOKIE_SECRET || "goldhawk_dev_secret"));

// Mount the SAFE board consent route
const safeBoardConsentRoutes = require("./routes/startup_pipeline_legal_safe_board_consent");
app.use("/startup_pipeline_legal_safe_board_consent", safeBoardConsentRoutes);

// Mount primary API routes
const apiRoutes = require("./routes");
app.use("/api", apiRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Start the server (if not already present)
const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
