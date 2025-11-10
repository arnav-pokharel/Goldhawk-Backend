
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const { OpenAI } = require("openai");
const { v4: uuidv4 } = require("uuid");
const pool = require("../../db/pool");
const { s3Client } = require("../../services/s3");

const openaiClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const ensureValidateColumns = async () => {
  const queries = [
    "ALTER TABLE founder_validate ADD COLUMN IF NOT EXISTS ad_tech JSONB",
    "ALTER TABLE founder_validate ADD COLUMN IF NOT EXISTS ad_business JSONB",
    "ALTER TABLE founder_validate ADD COLUMN IF NOT EXISTS tech_dde JSONB",
    "ALTER TABLE founder_validate ADD COLUMN IF NOT EXISTS business_dde JSONB"
  ];
  for (const q of queries) {
    try {
      await pool.query(q);
    } catch (err) {
      console.warn("ensureValidateColumns warning:", err?.message || err);
    }
  }
};

const safeParseJson = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
};

const ensureOverviewMap = (raw) => {
  const parsed = safeParseJson(raw, {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed;
};

const ensureOverviewMeta = (raw) => {
  const parsed = safeParseJson(raw, []);
  if (Array.isArray(parsed)) {
    return parsed.filter(Boolean).map((item, index) => ({
      ...item,
      id: item?.id || `doc${index + 1}`,
    }));
  }
  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed).map(([id, value]) => ({ id, ...(value || {}) }));
  }
  return [];
};

const readS3Object = async (key) => {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  });
  const response = await s3Client.send(command);
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const extractTextFromBuffer = async (buffer, mimetype) => {
  try {
    if (mimetype === "application/pdf") {
      const parsed = await pdfParse(buffer);
      return parsed.text;
    }
    if (
      mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimetype === "application/msword"
    ) {
      try {
        const { value } = await mammoth.extractRawText({ buffer });
        return value;
      } catch (err) {
        console.warn("DOCX extraction failed, falling back to plain text", err?.message || err);
        return buffer.toString("utf8");
      }
    }
    return buffer.toString("utf8");
  } catch (err) {
    console.error("extractTextFromBuffer error:", err);
    return buffer.toString("utf8");
  }
};

const buildPrompt = (text) => {
  const trimmed = text.length > 16000 ? text.slice(0, 16000) : text;
  return `You are an expert venture diligence analyst. Review the following overview document for a startup and craft two sets of due diligence questions.
Respond strictly in minified JSON with the shape {"tech": [eight questions], "business": [five questions]}.
Focus tech questions on codebase, architecture, reliability, DevOps, data, security, and product specifics.
Focus business questions on GTM, revenue, compliance, operations, and strategic risk. 
Avoid numbering, avoid explanations, include concise questions.

Document: 
${trimmed}`;
};

const formatQuestionSet = (questions, prefix) => {
  const obj = {};
  questions.forEach((question, idx) => {
    const key = `${prefix}${idx + 1}`;
    obj[key] = { question: question.trim() };
  });
  return obj;
};

const normalizeAnswerPayload = (items = []) => {
  const result = {};
  items.forEach((item, idx) => {
    if (!item) return;
    const key = item.id || `Q${idx + 1}`;
    result[key] = {
      question: item.question || "",
      answer: item.answer || "",
    };
  });
  return result;
};

exports.generateAdaptiveQuestions = async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) {
      return res.status(400).json({ error: "uid required" });
    }
    if (!openaiClient) {
      return res.status(500).json({ error: "OpenAI API key is not configured" });
    }

    const step3 = await pool.query(
      "SELECT overview_doc_url, overview_doc_meta FROM founder_step3 WHERE uid = $1",
      [uid]
    );
    if (step3.rowCount === 0) {
      return res.status(404).json({ error: "No overview document found" });
    }

    const overviewMap = ensureOverviewMap(step3.rows[0].overview_doc_url);
    const overviewMeta = ensureOverviewMeta(step3.rows[0].overview_doc_meta);
    const entries = Object.entries(overviewMap);
    if (entries.length === 0) {
      return res.status(404).json({ error: "No overview document entries available" });
    }

    // Use the most recently added document (last entry)
    const [docId, key] = entries[entries.length - 1];
    const meta = overviewMeta.find((item) => item.id === docId) || {};
    const mimetype = meta.mimetype || "application/pdf";

    const buffer = await readS3Object(key);
    const text = await extractTextFromBuffer(buffer, mimetype);
    const prompt = buildPrompt(text);

    const response = await openaiClient.chat.completions.create({
      model: process.env.OPENAI_VALIDATION_MODEL || "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: "You are a concise due diligence assistant that only returns JSON.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = response?.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      const jsonStart = raw.indexOf("{");
      const jsonEnd = raw.lastIndexOf("}");
      parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    } catch (err) {
      console.error("Failed to parse OpenAI response", err, raw);
      return res.status(502).json({ error: "OpenAI response parsing failed" });
    }

    const techList = Array.isArray(parsed.tech) ? parsed.tech.slice(0, 8) : [];
    const businessList = Array.isArray(parsed.business) ? parsed.business.slice(0, 5) : [];

    if (techList.length < 8 || businessList.length < 5) {
      return res.status(502).json({ error: "OpenAI response missing required questions" });
    }

    const adTech = formatQuestionSet(techList, "Q");
    const adBusiness = formatQuestionSet(businessList, "Q");

    await ensureValidateColumns();

    const existingValidate = await pool.query(
      "SELECT id FROM founder_validate WHERE uid = $1 ORDER BY updated_at DESC NULLS LAST LIMIT 1",
      [uid]
    );

    if (existingValidate.rowCount > 0) {
      await pool.query(
        "UPDATE founder_validate SET ad_tech = $1, ad_business = $2, updated_at = NOW() WHERE id = $3",
        [adTech, adBusiness, existingValidate.rows[0].id]
      );
    } else {
      await pool.query(
        "INSERT INTO founder_validate (id, uid, ad_tech, ad_business, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())",
        [uuidv4(), uid, adTech, adBusiness]
      );
    }

    return res.json({
      message: "Adaptive questions generated",
      ad_tech: adTech,
      ad_business: adBusiness,
    });
  } catch (err) {
    console.error("generateAdaptiveQuestions error:", err);
    return res.status(500).json({ error: "Failed to generate adaptive questions" });
  }
};

exports.getAdaptiveQuestions = async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: "uid required" });

    await ensureValidateColumns();

    const result = await pool.query(
      "SELECT ad_tech, ad_business, tech_dde, business_dde FROM founder_validate WHERE uid = $1 ORDER BY updated_at DESC NULLS LAST LIMIT 1",
      [uid]
    );

    if (result.rowCount === 0) {
      return res.json({ ad_tech: null, ad_business: null, tech_dde: null, business_dde: null });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("getAdaptiveQuestions error:", err);
    return res.status(500).json({ error: "Failed to fetch adaptive questions" });
  }
};

exports.saveAdaptiveAnswers = async (req, res) => {
  try {
    const { uid } = req.params;
    const { tech, business } = req.body || {};

    if (!uid) return res.status(400).json({ error: "uid required" });

    await ensureValidateColumns();

    const hasTech = Array.isArray(tech);
    const hasBusiness = Array.isArray(business);
    const techPayload = hasTech ? normalizeAnswerPayload(tech) : null;
    const businessPayload = hasBusiness ? normalizeAnswerPayload(business) : null;

    const existing = await pool.query(
      "SELECT id, tech_dde, business_dde FROM founder_validate WHERE uid = $1 ORDER BY updated_at DESC NULLS LAST LIMIT 1",
      [uid]
    );

    if (existing.rowCount > 0) {
      const current = existing.rows[0];
      const nextTech = hasTech ? techPayload : current.tech_dde || {};
      const nextBusiness = hasBusiness ? businessPayload : current.business_dde || {};

      await pool.query(
        "UPDATE founder_validate SET tech_dde = $1, business_dde = $2, updated_at = NOW() WHERE id = $3",
        [nextTech, nextBusiness, current.id]
      );
    } else {
      await pool.query(
        "INSERT INTO founder_validate (id, uid, tech_dde, business_dde, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())",
        [uuidv4(), uid, techPayload || {}, businessPayload || {}]
      );
    }

    return res.json({ message: "Adaptive answers saved" });
  } catch (err) {
    console.error("saveAdaptiveAnswers error:", err);
    return res.status(500).json({ error: "Failed to save adaptive answers" });
  }
};
