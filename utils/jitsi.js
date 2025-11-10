const jwt = require("jsonwebtoken");

function getJitsiConfig() {
  const appId = process.env.JITSI_APP_ID;
  const secret = process.env.JITSI_APP_SECRET;
  if (!appId || !secret) {
    throw new Error("Jitsi JWT env vars missing: JITSI_APP_ID / JITSI_APP_SECRET");
  }
  return {
    appId,
    secret,
    aud: process.env.JITSI_AUDIENCE || "jitsi",
    sub: process.env.JITSI_SUB || process.env.JITSI_DOMAIN || "meet.jit.si",
    ttl: Number(process.env.JITSI_TOKEN_TTL || 300),
  };
}

function buildJitsiModeratorToken({ room, user = {}, moderator = true }) {
  if (!room) throw new Error("room is required for Jitsi token");
  const { appId, secret, aud, sub, ttl } = getJitsiConfig();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud,
    iss: appId,
    sub,
    room,
    exp: now + ttl,
    nbf: now - 10,
    context: {
      features: {
        livestreaming: false,
        "outbound-call": false,
        recording: false,
        transcription: false,
      },
      user: {
        name: user.name || "Host",
        email: user.email || undefined,
        avatar: user.avatar || undefined,
        moderator: moderator ? "true" : "false",
      },
    },
  };

  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    header: { kid: appId },
  });
}

module.exports = { buildJitsiModeratorToken };
