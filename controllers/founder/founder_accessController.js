"use strict";

const { PrismaClient } = require("@prisma/client");
const { mergeSections, ensureSection } = require("./access_section");

const prisma = new PrismaClient();

const JSON_COLUMNS = new Set(["access_sc", "access_cicd", "access_fe", "access_be", "access_db"]);
const STRING_COLUMNS = new Set(["access_ff"]);

function coerceIncomingSection(value) {
  if (value == null) {
    return ensureSection(null);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return ensureSection(parsed);
    } catch (error) {
      return ensureSection(null);
    }
  }

  if (typeof value === "object") {
    return ensureSection(value);
  }

  return ensureSection(null);
}

function redactSectionForClient(section) {
  if (section == null) {
    return null;
  }

  if (typeof section === "string") {
    try {
      const parsed = JSON.parse(section);
      return redactSectionForClient(parsed);
    } catch (error) {
      return ensureSection(null);
    }
  }

  if (typeof section !== "object") {
    return ensureSection(null);
  }

  const normalized = ensureSection(section);
  const providers = {};
  for (const [key, value] of Object.entries(normalized.providers || {})) {
    if (!value || typeof value !== "object") continue;
    const copy = { ...value };
    delete copy.access_token;
    delete copy.refresh_token;
    providers[key] = copy;
  }

  return { ...normalized, providers };
}

async function getValidationAccess(req, res) {
  const { uid } = req.params;
  if (!uid) {
    return res.status(400).json({ error: "uid required" });
  }

  try {
    const record = await prisma.founder_validation_access.findUnique({ where: { uid } });
    if (!record) {
      return res.json({
        uid,
        access_sc: null,
        access_cicd: null,
        access_fe: null,
        access_be: null,
        access_db: null,
        access_bl: null,
        access_ff: "",
      });
    }

    const response = {
      uid: record.uid,
      access_sc: record.access_sc ? redactSectionForClient(record.access_sc) : null,
      access_cicd: record.access_cicd ? redactSectionForClient(record.access_cicd) : null,
      access_fe: record.access_fe ?? null,
      access_be: record.access_be ?? null,
      access_db: record.access_db ?? null,
      access_bl: record.access_bl ?? null,
      access_ff: record.access_ff ?? "",
      created_at: record.created_at || null,
      updated_at: record.updated_at || null,
    };

    return res.json(response);
  } catch (error) {
    console.error("getValidationAccess error", error);
    return res.status(500).json({ error: "Failed to load validation access" });
  }
}

async function saveValidationAccess(req, res) {
  const { uid } = req.params;
  if (!uid) {
    return res.status(400).json({ error: "uid required" });
  }

  const payload = req.body || {};

  const updateFields = {};

  try {
    const existing = await prisma.founder_validation_access.findUnique({ where: { uid } });

    for (const key of Object.keys(payload)) {
      if (key === "access_sc") {
        const incoming = coerceIncomingSection(payload[key]);
        const merged = mergeSections(existing?.[key], incoming);
        updateFields[key] = merged;
      } else if (key === "access_fe" || key === "access_be" || key === "access_db") {
        const val = payload[key];
        if (val && typeof val === "object" && !Array.isArray(val) && !val.selected) {
          // Accept simple mapping objects directly
          updateFields[key] = val;
        } else {
          // Fallback to section merge for backward compatibility
          const incoming = coerceIncomingSection(val);
          const merged = mergeSections(existing?.[key], incoming);
          updateFields[key] = merged;
        }
      } else if (STRING_COLUMNS.has(key)) {
        const value = payload[key];
        updateFields[key] = typeof value === "string" ? value : existing?.[key] ?? "";
      }
    }

    if (!Object.keys(updateFields).length) {
      return res.status(400).json({ error: "No recognized fields provided" });
    }

    const now = new Date();
    const dataForUpdate = { ...updateFields, updated_at: now };
    const dataForCreate = { uid, created_at: now, updated_at: now, ...updateFields };

    const result = await prisma.founder_validation_access.upsert({
      where: { uid },
      update: dataForUpdate,
      create: dataForCreate,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("saveValidationAccess error", error);
    return res.status(500).json({ error: "Failed to save validation access" });
  }
}

module.exports = {
  getValidationAccess,
  saveValidationAccess,
};


