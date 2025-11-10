// controllers/founder/founder_pitchController.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const s3 = require("../../services/s3");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

// --- helper: build object key for where we store files
const keyFor = (uid, nameWithExt) => `founder/${uid}/flowdeck/${nameWithExt}`;

// --- helper: detect if DB field holds a key or an old Location URL; return a key
function extractKey(stored) {
  if (!stored) return null;
  if (stored.includes(".amazonaws.com/")) {
    const raw = stored.split(".amazonaws.com/")[1];
    try {
      // Our s3 service URL-encodes the full key, so decode it back
      return decodeURIComponent(raw);
    } catch (_) {
      return raw;
    }
  }
  return stored;
}

// Upload a file to S3 at a given key; return meta (we will store the key in DB)
async function uploadAtKey(file, key) {
  await s3.uploadFile(file.buffer, key, file.mimetype);
  return {
    key,
    meta: {
      size: file.size,
      mimetype: file.mimetype,
      originalName: file.originalname,
    },
  };
}

// POST /founder/pitch/upload
exports.uploadPitch = async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Authentication error: User not identified." });
    }
    const { uid } = req.user;
    const { pitch_1_des, pitch_2_des, pitch_3_des } = req.body || {};

    const updateData = {
      pitch_1_des,
      pitch_2_des,
      pitch_3_des,
      updated_at: new Date(),
    };

    const pitchUploads = [
      { fieldName: "pitch1", dbPrefix: "pitch_video_1" },
      { fieldName: "pitch2", dbPrefix: "pitch_video_2" },
      { fieldName: "pitch3", dbPrefix: "pitch_video_3" },
    ];

    for (const { fieldName, dbPrefix } of pitchUploads) {
      if (req.files && req.files[fieldName]) {
        const file = req.files[fieldName][0];
        const ext = path.extname(file.originalname);
        const key = keyFor(uid, `${fieldName}${ext || ".mp4"}`);
        const result = await uploadAtKey(file, key);
        updateData[`${dbPrefix}_url`] = result.key; // store KEY only
        updateData[`${dbPrefix}_meta`] = result.meta;
      }
    }

    if (req.files && req.files.deck) {
      const file = req.files.deck[0];
      const ext = path.extname(file.originalname);
      const key = keyFor(uid, `pitch_deck${ext || ".pdf"}`);
      const result = await uploadAtKey(file, key);
      updateData.pitch_deck_url = result.key;
      updateData.pitch_deck_meta = result.meta;
    }

    // Handle optional thumbnail image (store as 'thumb' under flowdeck)
    if (req.files && req.files.thumbnail) {
      try {
        const tfile = req.files.thumbnail[0];
        const ext = path.extname(tfile.originalname) || '.jpg';
        const key = keyFor(uid, `thumb${ext}`);
        const result = await uploadAtKey(tfile, key);
  updateData.thumb_url = result.key; // store S3 key
      } catch (e) {
        console.warn('Thumbnail upload failed, continuing without it', e?.message || e);
      }
    }

    const existing = await prisma.founder_step3.findFirst({ where: { uid } });
    if (existing) {
      await prisma.founder_step3.update({ where: { id: existing.id }, data: updateData });
    } else {
      await prisma.founder_step3.create({ data: { id: uuidv4(), uid, ...updateData } });
    }

    res.json({ success: true, message: "Pitch materials uploaded successfully." });
  } catch (err) {
    console.error("Pitch upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
};

// GET /founder/pitch/view (no direct links)
exports.viewPitch = async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Authentication error: User not identified." });
    }
    const { uid } = req.user;

    const data = await prisma.founder_step3.findFirst({
      where: { uid },
      select: {
        pitch_video_1_url: true,
        pitch_video_2_url: true,
        pitch_video_3_url: true,
        pitch_deck_url: true,
        pitch_1_des: true,
        pitch_2_des: true,
        pitch_3_des: true,
      },
    });

    if (!data) return res.status(404).json({ error: "No pitch data found" });

    res.json({
      uid,
      pitch_1_des: data.pitch_1_des,
      pitch_2_des: data.pitch_2_des,
      pitch_3_des: data.pitch_3_des,
      has_pitch1: !!data.pitch_video_1_url,
      has_pitch2: !!data.pitch_video_2_url,
      has_pitch3: !!data.pitch_video_3_url,
      has_deck: !!data.pitch_deck_url,
    });
  } catch (err) {
    console.error("View pitch error:", err);
    res.status(500).json({ error: "Failed to fetch pitch data" });
  }
};

// POST /founder/pitch/update-descriptions
exports.updateDescriptions = async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Authentication error: User not identified." });
    }
    const { uid } = req.user;
    const { pitch_1_des, pitch_2_des, pitch_3_des } = req.body || {};

    const data = {
      pitch_1_des: pitch_1_des ?? null,
      pitch_2_des: pitch_2_des ?? null,
      pitch_3_des: pitch_3_des ?? null,
      updated_at: new Date(),
    };

    const existing = await prisma.founder_step3.findFirst({ where: { uid } });
    if (existing) {
      await prisma.founder_step3.update({ where: { id: existing.id }, data });
    } else {
      await prisma.founder_step3.create({ data: { id: uuidv4(), uid, ...data } });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Failed to update descriptions:", err);
    return res.status(500).json({ error: "Failed to update descriptions" });
  }
};

// GET /founder/pitch/stream/:slot — secure streaming through backend with Range support
exports.streamPitch = async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { uid } = req.user;
    const slot = String(req.params.slot || "").toLowerCase();

    const slotToField = {
      pitch1: "pitch_video_1_url",
      pitch2: "pitch_video_2_url",
      pitch3: "pitch_video_3_url",
      deck: "pitch_deck_url",
    };
    const field = slotToField[slot];
    if (!field) return res.status(400).json({ error: "Invalid slot" });

    const row = await prisma.founder_step3.findFirst({ where: { uid }, select: { [field]: true } });
    if (!row || !row[field]) return res.status(404).json({ error: "File not found" });

    const key = extractKey(row[field]);
    const bucket = process.env.S3_BUCKET_NAME;

    // Head to get size/type
    let head;
    try {
      head = await s3.s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (e) {
      console.error("S3 HeadObject failed", {
        name: e?.name,
        message: e?.message,
        code: e?.Code || e?.code,
        httpStatus: e?.$metadata?.httpStatusCode,
        requestId: e?.$metadata?.requestId,
        extendedRequestId: e?.$metadata?.extendedRequestId,
        bucket,
        key,
      });
      throw e;
    }
    const fileSize = head.ContentLength;
    const contentType = head.ContentType || (slot === "deck" ? "application/pdf" : "video/mp4");

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d+)-(\d+)?/.exec(range);
      const start = match ? parseInt(match[1], 10) : 0;
      const end = match && match[2] ? parseInt(match[2], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${end}` });
      let data;
      try {
        data = await s3.s3Client.send(cmd);
      } catch (e) {
        console.error("S3 GetObject (range) failed", {
          name: e?.name,
          message: e?.message,
          code: e?.Code || e?.code,
          httpStatus: e?.$metadata?.httpStatusCode,
          requestId: e?.$metadata?.requestId,
          extendedRequestId: e?.$metadata?.extendedRequestId,
          bucket,
          key,
          range: `bytes=${start}-${end}`,
        });
        throw e;
      }

      // Use Express header methods to preserve CORS headers set by cors middleware
      res.status(206).set({
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      });
      res.flushHeaders?.();
      data.Body.pipe(res);
    } else {
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      let data;
      try {
        data = await s3.s3Client.send(cmd);
      } catch (e) {
        console.error("S3 GetObject failed", {
          name: e?.name,
          message: e?.message,
          code: e?.Code || e?.code,
          httpStatus: e?.$metadata?.httpStatusCode,
          requestId: e?.$metadata?.requestId,
          extendedRequestId: e?.$metadata?.extendedRequestId,
          bucket,
          key,
        });
        throw e;
      }

      res.status(200).set({
        "Content-Length": String(fileSize),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      });
      res.flushHeaders?.();
      data.Body.pipe(res);
    }
  } catch (err) {
    console.error("Stream error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Stream failed" });
  }
};
