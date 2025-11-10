const express = require("express");
const http = require("http");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./docs/swagger");
const { Server } = require("socket.io");
const pool = require("./db/pool");
const { setIO } = require("./services/socket");

const {
  startGithubOAuth,
  handleGithubCallback,
} = require("./controllers/founder/founder_githubController");
const {
  startGitlabOAuth,
  handleGitlabCallback,
} = require("./controllers/founder/founder_gitlabController");


require("dotenv").config();

const app = express();
const server = http.createServer(app);

function normalizeOriginValue(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const proto = url.protocol ? url.protocol.toLowerCase() : "https:";
    const host = url.host.toLowerCase();
    return `${proto}//${host}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function parseOriginList(...values) {
  const out = new Set();
  values
    .filter(Boolean)
    .map((v) => String(v).split(","))
    .flat()
    .map(normalizeOriginValue)
    .filter((v) => typeof v === "string" && v.length > 0)
    .forEach((v) => out.add(v));
  return Array.from(out);
}

const FALLBACK_FRONTEND_ORIGINS = parseOriginList(process.env.FRONTEND_URL);
const EXPLICIT_ALLOWED_ORIGINS = parseOriginList(
  process.env.CORS_ALLOWED_ORIGINS,
  process.env.ALLOWED_ORIGINS
);
const BASE_ALLOWED_ORIGINS =
  EXPLICIT_ALLOWED_ORIGINS.length > 0
    ? EXPLICIT_ALLOWED_ORIGINS
    : FALLBACK_FRONTEND_ORIGINS;
const SOCKET_ALLOWED_ORIGINS = parseOriginList(
  ...BASE_ALLOWED_ORIGINS,
  process.env.SOCKET_ALLOWED_ORIGINS
);

const ALLOW_ALL_WEB = BASE_ALLOWED_ORIGINS.length === 0;
const ALLOW_ALL_SOCKET = SOCKET_ALLOWED_ORIGINS.length === 0;

if (ALLOW_ALL_WEB) {
  console.warn("[CORS] No FRONTEND_URL/CORS_ALLOWED_ORIGINS configured. Allowing all origins.");
}
if (ALLOW_ALL_SOCKET) {
  console.warn("[Socket.IO] No SOCKET_ALLOWED_ORIGINS configured. Allowing all origins.");
}

const LOCALHOST_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

//
// CORS: allow frontend with cookies
//
const corsOptions = {
  origin: function (origin, callback) {
    if (ALLOW_ALL_WEB) return callback(null, true);
    if (!origin) return callback(null, true); // allow curl/postman (no origin)
    const normalizedOrigin = normalizeOriginValue(origin);
    if (normalizedOrigin && BASE_ALLOWED_ORIGINS.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    const isLocalhost = normalizedOrigin ? LOCALHOST_REGEX.test(normalizedOrigin) : false;
    if (isLocalhost) return callback(null, true);

    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
};

app.use(cors(corsOptions));

// Explicitly handle CORS preflight for all routes (regex to avoid path-to-regexp '*' issue)
app.options(/.*/, cors(corsOptions));

//
// Middleware
//
app.use(
  cookieParser(
    process.env.COOKIE_SECRET ||
    "d9309bad08cd2a9dccd9a1df3442510991dd28e364dd58a54c90f132d51b0c703fedbded88097c63629db31b6b79e8ea20b2583b8e45790068010ea7ab794153"
  )
);
// Increase JSON and URL-encoded body size limits to support base64 images
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

//
// Routes (centralized entry)
//
const routes = require("./routes"); // loads routes/index.js automatically
app.use("/api", routes);

app.get("/founder/oauth/github", startGithubOAuth);
app.get("/founder/oauth/github/callback", handleGithubCallback);
app.get("/founder/oauth/gitlab", startGitlabOAuth);
app.get("/founder/oauth/gitlab/callback", handleGitlabCallback);

// Public callback alias (no /api prefix) for hosted verification redirects
// This allows using Redirect URI = https://<domain>/verification/callback
app.use('/verification/callback', require('./routes/verification_callback'));

//
// Swagger Docs
//
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

//
// Start Server
//
//
// Socket.IO setup
//
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (ALLOW_ALL_SOCKET) return callback(null, true);
      if (!origin) return callback(null, true);
      const normalizedOrigin = normalizeOriginValue(origin);
      if (normalizedOrigin && SOCKET_ALLOWED_ORIGINS.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      const isLocalhost = normalizedOrigin ? LOCALHOST_REGEX.test(normalizedOrigin) : false;
      if (isLocalhost) return callback(null, true);
      console.warn(`[Socket.IO] Blocked origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

setIO(io);

io.on("connection", (socket) => {
  // Authentication middleware for socket
  socket.on('authenticate', (userId) => {
    if (userId) {
      socket.userId = userId;
      socket.join(`user:${userId}`);
    }
  });
  // Client will emit 'chat:join' with a deal_id
  socket.on("chat:join", ({ deal_id }) => {
    if (!deal_id) return;
    socket.join(`chat:deal:${deal_id}`);
  });
  socket.on("chat:leave", ({ deal_id }) => {
    if (!deal_id) return;
    socket.leave(`chat:deal:${deal_id}`);
  });
  // Client-wide user listener for notifications
  socket.on("chat:listen", ({ user_uid }) => {
    if (!user_uid) return;
    socket.join(`chat:user:${user_uid}`);
  });

  // Call start - notify the other user
  socket.on('call:start', async (payload) => {
    console.log('call:start', payload);
    try {
      const { deal_id, caller_uid, callee_uid, call_id } = payload || {};
      if (!deal_id || !caller_uid || !callee_uid) return;
      // Get caller info for notification
      let display_name = null;
      let avatar = null;
      let caller_type = 'investor'; // default

      try {
        // Try to get founder info first
        const founderQuery = await pool.query(
          `SELECT company_name, logo, admin_founder_name, admin_founder_profile_picture 
           FROM startup_active WHERE uid = $1 LIMIT 1`,
          [caller_uid]
        );
        
        if (founderQuery.rows.length > 0) {
          const founder = founderQuery.rows[0];
          display_name = founder.company_name || founder.admin_founder_name;
          avatar = founder.logo || founder.admin_founder_profile_picture;
          caller_type = 'founder';
        } else {
          // Try to get investor info
          const investorQuery = await pool.query(
            `SELECT angel_name, profile_picture FROM angel_onboarding WHERE uid = $1 LIMIT 1`,
            [caller_uid]
          );
          if (investorQuery.rows.length > 0) {
            const investor = investorQuery.rows[0];
            display_name = investor.angel_name;
            avatar = investor.profile_picture;
            caller_type = 'investor';
          }
        }
      } catch (e) {
        console.error('Error fetching caller info:', e);
      }

      // Send call notification to the specific user
      io.to(`user:${callee_uid}`).emit('call:ring', {
        deal_id,
        caller_uid,
        callee_uid,
        call_id: call_id || `call-${Date.now()}`,
        display_name,
        avatar,
        caller_type,
        room: `call-${deal_id}`
      });
      
      console.log('Call ring sent to user:', callee_uid);

    } catch (error) {
      console.error('call:start error', error);
    }
  });

  // Call accept - notify caller
  socket.on('call:accept', (payload) => {
    console.log('call:accept', payload);
    try {
      const { deal_id, caller_uid, callee_uid } = payload || {};
      if (!deal_id || !caller_uid || !callee_uid) return;

      // Notify caller that call was accepted
      io.to(`user:${caller_uid}`).emit('call:accepted', { 
        deal_id, 
        caller_uid, 
        callee_uid 
      });
      
      console.log('Call accepted notification sent to caller:', caller_uid);

    } catch (error) {
      console.error('call:accept error', error);
    }
  });

  // Call decline - notify caller
  socket.on('call:decline', (payload) => {
    console.log('call:decline', payload);
    try {
      const { deal_id, caller_uid, callee_uid } = payload || {};
      if (!deal_id || !caller_uid || !callee_uid) return;

      io.to(`user:${caller_uid}`).emit('call:declined', { 
        deal_id, 
        caller_uid, 
        callee_uid 
      });
      
      console.log('Call declined notification sent');

    } catch (error) {
      console.error('call:decline error', error);
    }
  });

  // WebRTC signaling events
socket.on('webrtc:offer', (payload) => {
  console.log('webrtc:offer', {
    from: socket.userId || 'unknown',
    to: payload.toUid,
    dealId: payload.dealId
  });
  try {
    const { dealId, toUid, sdp, callId } = payload || {};
    if (!dealId || !toUid || !sdp) {
      console.log('Missing required fields for offer');
      return;
    }

    // Forward offer to the target user using user-specific room
    io.to(`user:${toUid}`).emit('webrtc:offer', {
      dealId,
      fromUid: socket.userId || payload.fromUid,
      sdp,
      callId
    });
    console.log('Offer forwarded to user:', toUid);
  } catch (error) {
    console.error('webrtc:offer error', error);
  }
});

socket.on('webrtc:answer', (payload) => {
  console.log('webrtc:answer', {
    from: socket.userId || 'unknown',
    to: payload.toUid,
    dealId: payload.dealId
  });
  try {
    const { dealId, toUid, sdp, callId } = payload || {};
    if (!dealId || !toUid || !sdp) {
      console.log('Missing required fields for answer');
      return;
    }

    // Forward answer to the target user using user-specific room
    io.to(`user:${toUid}`).emit('webrtc:answer', {
      dealId,
      fromUid: socket.userId || payload.fromUid,
      sdp,
      callId
    });
    console.log('Answer forwarded to user:', toUid);
  } catch (error) {
    console.error('webrtc:answer error', error);
  }
});

socket.on('webrtc:ice', (payload) => {
  console.log('webrtc:ice', {
    from: socket.userId || 'unknown',
    to: payload.toUid,
    dealId: payload.dealId
  });
  try {
    const { dealId, toUid, candidate } = payload || {};
    if (!dealId || !toUid || !candidate) {
      console.log('Missing required fields for ICE candidate');
      return;
    }

    // Forward ICE candidate to the target user using user-specific room
    io.to(`user:${toUid}`).emit('webrtc:ice', {
      dealId,
      fromUid: socket.userId || payload.fromUid,
      candidate
    });
    console.log('ICE candidate forwarded to user:', toUid);
  } catch (error) {
    console.error('webrtc:ice error', error);
  }
});

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, reason);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Swagger docs available at http://localhost:${PORT}/api/docs`);
});
