const { GetObjectCommand } = require("@aws-sdk/client-s3");
const jwt = require("jsonwebtoken");
const { s3Client, getPrivateUrl } = require("../../../services/s3");
const { SESSION_COOKIE_NAMES } = require('../../../utils/cookies');

function ensureAuthenticated(req, res, next) {
  try {
    const authHeader = req.headers["authorization"]; 
    const bearer = authHeader && authHeader.split(" ")[1];
    // Accept both signed and plain cookies
    const cookieToken = SESSION_COOKIE_NAMES.map(name =>
      (req.signedCookies && req.signedCookies[name]) ||
      (req.cookies && req.cookies[name])
    ).find(Boolean);

    if (!bearer && !cookieToken) return res.status(401).json({ error: "Unauthorized" });

    // Verify helper that tries multiple secrets (for historical differences)
    const tryDecode = (tok) => {
      const secrets = [
        process.env.COOKIE_SECRET,
        process.env.JWT_SECRET,
        process.env.SESSION_SECRET,
      ].filter(Boolean);
      for (const s of secrets) {
        try { return jwt.verify(tok, s); } catch (_) {}
      }
      return null;
    };

    // Try cookie token first (founder/angel cookie)
    if (cookieToken) {
      const u = tryDecode(cookieToken);
      if (u) { req.user = u; return next(); }
    }

    if (bearer) {
      const u = tryDecode(bearer);
      if (u) { req.user = u; return next(); }
    }

    return res.status(401).json({ error: "Invalid or expired token" });
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function parseS3Url(url) {
  try {
    const u = new URL(url);
    // Expect virtual-hosted–style: https://bucket.s3.region.amazonaws.com/key
    const hostParts = u.hostname.split(".");
    const bucket = hostParts[0];
    const isS3 = hostParts[1] === "s3";
    if (!isS3) return null;
    const key = decodeURIComponent(u.pathname.replace(/^\//, ""));
    return { bucket, key };
  } catch (e) {
    return null;
  }
}

async function streamS3Object(res, bucket, key, rangeHeader) {
  const params = { Bucket: bucket, Key: key };
  if (rangeHeader) params.Range = rangeHeader;

  const cmd = new GetObjectCommand(params);
  const obj = await s3Client.send(cmd);

  const isPartial = !!rangeHeader && !!obj.ContentRange;
  const status = isPartial ? 206 : 200;

  // Best-effort content type
  if (obj.ContentType) {
    res.setHeader("Content-Type", obj.ContentType);
  } else {
    const ext = (key.split('.').pop() || '').toLowerCase();
    const map = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      m3u8: 'application/vnd.apple.mpegurl',
      mpd: 'application/dash+xml',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg'
    };
    if (map[ext]) res.setHeader('Content-Type', map[ext]);
  }
  res.setHeader("Accept-Ranges", "bytes");
  if (obj.ContentLength) res.setHeader("Content-Length", obj.ContentLength);
  if (obj.ContentRange) res.setHeader("Content-Range", obj.ContentRange);

  res.status(status);
  obj.Body.pipe(res);
}

exports.ensureAuthenticated = ensureAuthenticated;

// GET /api/media/stream-by-key?key=ang_investor/<uid>/profile/video.mp4
exports.streamByKey = async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: "key is required" });
    await streamS3Object(res, process.env.S3_BUCKET_NAME, String(key), req.headers.range);
  } catch (e) {
    console.error("Media stream error (key):", e);
    res.status(500).json({ error: "Failed to stream media" });
  }
};

// GET /api/media/stream-by-url?url=https%3A%2F%2Fbucket.s3.region.amazonaws.com%2Fpath%2Ffile.mp4
exports.streamByUrl = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "url is required" });
    const parsed = parseS3Url(String(url));
    if (!parsed) return res.status(400).json({ error: "Invalid S3 URL" });
    // Optional: lock to expected bucket
    if (process.env.S3_BUCKET_NAME && parsed.bucket !== process.env.S3_BUCKET_NAME) {
      return res.status(400).json({ error: "Bucket not allowed" });
    }
    await streamS3Object(res, parsed.bucket, parsed.key, req.headers.range);
  } catch (e) {
    console.error("Media stream error (url):", e);
    res.status(500).json({ error: "Failed to stream media" });
  }
};

// GET /api/media/issue?url=<encoded s3 url>
// Returns a short-lived signed media URL (CloudFront if available). No auth required.
exports.issue = async (req, res) => {
  try {
    const { url, key } = req.query;
    if (!url && !key) return res.status(400).json({ error: 'url or key is required' });

    let bucket, s3key;
    if (key) {
      bucket = process.env.S3_BUCKET_NAME;
      s3key = String(key);
    } else {
      const str = String(url);
      // If the caller passed a bare key instead of a full URL, accept it
      if (!/^https?:\/\//i.test(str)) {
        bucket = process.env.S3_BUCKET_NAME;
        s3key = str;
      } else {
        const parsed = parseS3Url(str);
        if (!parsed) return res.status(400).json({ error: 'Invalid S3 URL' });
        if (process.env.S3_BUCKET_NAME && parsed.bucket !== process.env.S3_BUCKET_NAME) {
          return res.status(400).json({ error: 'Bucket not allowed' });
        }
        bucket = parsed.bucket;
        s3key = parsed.key;
      }
    }

    const ttlSec = Number(process.env.MEDIA_TOKEN_TTL_SEC || 6 * 60 * 60); // default 6h

    // Prefer CloudFront-signed (or S3 presigned) URL when available, to avoid proxy token flow
    try {
      const privateUrl = await getPrivateUrl(s3key, ttlSec);
      if (privateUrl) {
        return res.json({ streamUrl: privateUrl, expiresIn: ttlSec });
      }
    } catch (_) { /* fall back to proxy */ }

    // Fallback: issue JWT token for proxy endpoint
    const signSecrets = [process.env.COOKIE_SECRET, process.env.JWT_SECRET, process.env.SESSION_SECRET].filter(Boolean);
    const secret = signSecrets[0];
    if (!secret) {
      return res.status(500).json({ error: 'Server not configured for media signing' });
    }
    const token = jwt.sign({ bucket, key: s3key }, secret, { expiresIn: ttlSec });
    const base = `${req.protocol}://${req.get('host')}`;
    const streamUrl = `${base}/api/media/stream-signed?token=${encodeURIComponent(token)}`;
    return res.json({ streamUrl, expiresIn: ttlSec });
  } catch (e) {
    console.error('Media issue token error:', e);
    res.status(500).json({ error: 'Failed to issue stream token' });
  }
};

// GET /api/media/stream-signed?token=...
exports.streamSigned = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'token is required' });
    let payload;
    const tok = String(token);
    const trySecrets = [process.env.COOKIE_SECRET, process.env.JWT_SECRET, process.env.SESSION_SECRET].filter(Boolean);
    for (const secret of trySecrets) {
      try {
        payload = jwt.verify(tok, secret);
        break;
      } catch (_) {}
    }
    if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
    const { bucket, key } = payload || {};
    if (!bucket || !key) return res.status(400).json({ error: 'Invalid token payload' });
    await streamS3Object(res, bucket, key, req.headers.range);
  } catch (e) {
    console.error('Media stream-signed error:', e);
    res.status(500).json({ error: 'Failed to stream media' });
  }
};
