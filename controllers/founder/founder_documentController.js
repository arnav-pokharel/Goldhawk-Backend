const { PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const pool = require("../../db/pool");
const { s3Client } = require("../../services/s3");
const { v4: uuidv4 } = require("uuid");

const allowedTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

const sanitizeFilename = (name = "document") =>
  name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '_');

const safeParseJson = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const ensureOverviewMap = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = safeParseJson(raw, null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return { doc1: raw };
  }
  return {};
};

const ensureOverviewMeta = (raw) => {
  let arr = [];
  if (!raw) return [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'object') {
    arr = [raw];
  } else if (typeof raw === 'string') {
    const parsed = safeParseJson(raw, null);
    if (Array.isArray(parsed)) arr = parsed;
    else if (parsed && typeof parsed === 'object') arr = [parsed];
  }
  return arr
    .filter(Boolean)
    .map((item, index) => ({
      ...item,
      id: item?.id || `doc${index + 1}`,
    }));
};

const resolveOverviewKey = async (uid, docId) => {
  const res = await pool.query("SELECT overview_doc_url FROM founder_step3 WHERE uid = $1", [uid]);
  if (res.rowCount === 0) return null;
  const overviewMap = ensureOverviewMap(res.rows[0].overview_doc_url);
  return overviewMap[docId] || null;
};

// 📌 Upload Overview
exports.uploadOverview = async (req, res) => {

  try {

    const { uid } = req.params;

    const file = req.file;

    if (!file) return res.status(400).json({ error: "No file uploaded" });

    if (!allowedTypes.includes(file.mimetype)) {

      return res.status(400).json({ error: "Invalid file format" });

    }



    const baseName = sanitizeFilename(file.originalname || "overview.pdf");

    const uniqueKey = `founder/${uid}/validation/${Date.now()}-${baseName}`;



    await s3Client.send(new PutObjectCommand({

      Bucket: process.env.S3_BUCKET_NAME,

      Key: uniqueKey,

      Body: file.buffer,

      ContentType: file.mimetype,

    }));



    const existing = await pool.query("SELECT id, overview_doc_url, overview_doc_meta FROM founder_step3 WHERE uid = $1", [uid]);
    const existingRow = existing.rows[0];
    const overviewMap = ensureOverviewMap(existingRow?.overview_doc_url);
    const metaMap = new Map(
      ensureOverviewMeta(existingRow?.overview_doc_meta).map((entry) => [entry.id, { ...entry }])
    );

    const docId = `doc${Object.keys(overviewMap).length + 1}`;
    overviewMap[docId] = uniqueKey;
    metaMap.set(docId, {
      id: docId,
      name: file.originalname,
      key: uniqueKey,
      mimetype: file.mimetype,
      size: file.size,
      uploaded_at: new Date().toISOString(),
    });

    const orderedMeta = Object.entries(overviewMap).map(([id, key], index) => {
      const base = metaMap.get(id) || {};
      return {
        ...base,
        id,
        key,
        name: base.name || `Document ${index + 1}`,
      };
    });

    if (existing.rowCount > 0) {
      await pool.query(
        "UPDATE founder_step3 SET overview_doc_url = $1, overview_doc_meta = $2, updated_at = NOW() WHERE uid = $3",
        [JSON.stringify(overviewMap), JSON.stringify(orderedMeta), uid]
      );
    } else {
      await pool.query(
        "INSERT INTO founder_step3 (id, uid, overview_doc_url, overview_doc_meta, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())",
        [uuidv4(), uid, JSON.stringify(overviewMap), JSON.stringify(orderedMeta)]
      );
    }

    res.json({ message: "Overview uploaded", docId, key: uniqueKey });
  } catch (err) {

    console.error("Upload overview error:", err);

    res.status(500).json({ error: "Failed to upload overview" });

  }

};

// 📌 Upload Other Docs
exports.uploadOther = async (req, res) => {
  try {
    const { uid } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({ error: "Invalid file format" });
    }

    const key = `founder/${uid}/documents/${file.originalname}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));

    // Read existing other_doc JSON (stored as text) and append
    const cur = await pool.query("SELECT other_doc FROM founder_step3 WHERE uid = $1", [uid]);
    let arr = [];
    if (cur.rowCount > 0 && cur.rows[0].other_doc) {
      try { arr = JSON.parse(cur.rows[0].other_doc); } catch (_) { arr = []; }
    }
    arr.push({ name: file.originalname, key });

    if (cur.rowCount > 0) {
      await pool.query("UPDATE founder_step3 SET other_doc = $1, updated_at = NOW() WHERE uid = $2", [JSON.stringify(arr), uid]);
    } else {
      await pool.query("INSERT INTO founder_step3 (id, uid, other_doc, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())", [uuidv4(), uid, JSON.stringify(arr)]);
    }

    res.json({ message: "Document uploaded", key });
  } catch (err) {
    console.error("Upload other error:", err);
    res.status(500).json({ error: "Failed to upload document" });
  }
};

// 📌 Get Signed URL
exports.getSignedUrl = async (req, res) => {

  try {

    const { uid, type, filename } = req.params;



    let key;

    if (type === "overview") {

      key = await resolveOverviewKey(uid, filename);

      if (!key) {

        return res.status(404).json({ error: "Overview document not found" });

      }

    } else if (type === "other") {

      key = `founder/${uid}/documents/${filename}`;

    } else {

      return res.status(400).json({ error: "Invalid type" });

    }



    const url = await getSignedUrl(

      s3Client,

      new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key }),

      { expiresIn: 300 }

    );



    res.json({ url });

  } catch (err) {

    console.error("Signed URL error:", err);

    res.status(500).json({ error: "Failed to generate signed URL" });

  }

};

// List documents for a founder (based on DB entries)
exports.listDocuments = async (req, res) => {

  try {

    const { uid } = req.params;

    if (!req.user?.uid || req.user.uid !== uid) {

      return res.status(401).json({ error: "Unauthorized" });

    }

    const r = await pool.query(

      "SELECT overview_doc_url, overview_doc_meta, other_doc FROM founder_step3 WHERE uid = $1",

      [uid]

    );

    if (r.rowCount === 0) return res.json({ hasOverview: false, overviewDocs: [], otherDocs: [] });

    const row = r.rows[0];



    const overviewMap = ensureOverviewMap(row.overview_doc_url);

    const overviewMeta = ensureOverviewMeta(row.overview_doc_meta);

    const overviewDocs = Object.entries(overviewMap).map(([id, key]) => {

      const meta = overviewMeta.find((item) => item && item.id === id) || {};

      return {

        id,

        name: meta.name || id,

        key,

      };

    });



    let otherDocs = [];

    if (row.other_doc) {

      try {

        const parsed = JSON.parse(row.other_doc);

        otherDocs = Array.isArray(parsed)

          ? parsed.map((d) => ({ name: d.name, key: d.key || null })).filter((d) => !!d.name)

          : [];

      } catch (_) {

        otherDocs = [];

      }

    }



    const hasOverview = overviewDocs.length > 0;

    return res.json({ hasOverview, overviewDocs, otherDocs });

  } catch (err) {

    console.error("List documents error:", err);

    return res.status(500).json({ error: "Failed to list documents" });

  }

};

// Secure streaming proxy to prevent exposing S3 URLs directly
exports.streamDocument = async (req, res) => {
  try {
    const { uid: pathUid, type, filename } = req.params;
    const requesterUid = req.user?.uid;
    if (!requesterUid || requesterUid !== pathUid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let key;

    if (type === "overview") {

      key = await resolveOverviewKey(pathUid, filename);

      if (!key) {

        return res.status(404).json({ error: "Overview document not found" });

      }

    } else if (type === "other") {

      key = `founder/${pathUid}/documents/${filename}`;

    } else {

      return res.status(400).json({ error: "Invalid type" });

    }



    const bucket = process.env.S3_BUCKET_NAME;
    // Head to get size/type
    const head = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const fileSize = head.ContentLength;
    const contentType = head.ContentType || "application/octet-stream";

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d+)-(\d+)?/.exec(range);
      const start = match ? parseInt(match[1], 10) : 0;
      const end = match && match[2] ? parseInt(match[2], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${end}` });
      const data = await s3Client.send(cmd);
      res.status(206).set({
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${filename}"`
      });
      res.flushHeaders?.();
      data.Body.pipe(res);
    } else {
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      const data = await s3Client.send(cmd);
      res.status(200).set({
        "Content-Length": String(fileSize),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${filename}"`
      });
      res.flushHeaders?.();
      data.Body.pipe(res);
    }
  } catch (err) {
    console.error("Stream document error:", err);
    if (!res.headersSent) return res.status(500).json({ error: "Stream failed" });
  }
};
