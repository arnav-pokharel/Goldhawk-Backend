"use strict";

const { Buffer } = require("buffer");

const DEFAULT_SECTION = Object.freeze({
  selected: [],
  otherText: "",
  explanation: "",
  providers: {},
});

function createEmptySection() {
  return {
    selected: [],
    otherText: "",
    explanation: "",
    providers: {},
  };
}

function ensureSection(raw) {
  if (!raw || typeof raw !== "object") {
    return createEmptySection();
  }

  const selected = Array.isArray(raw.selected)
    ? raw.selected.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];

  const otherText = typeof raw.otherText === "string"
    ? raw.otherText
    : typeof raw.other === "string"
    ? raw.other
    : "";

  const explanation = typeof raw.explanation === "string" ? raw.explanation : "";

  const providers = {};
  if (raw.providers && typeof raw.providers === "object") {
    for (const [key, value] of Object.entries(raw.providers)) {
      if (value && typeof value === "object") {
        providers[key] = { ...value };
      }
    }
  }

  const section = createEmptySection();
  section.selected = Array.from(new Set(selected));
  section.otherText = otherText;
  section.explanation = explanation;
  section.providers = providers;

  if (raw.last_synced_at && typeof raw.last_synced_at === "string") {
    section.last_synced_at = raw.last_synced_at;
  }

  return section;
}

function mergeSections(existing, incoming) {
  const base = ensureSection(existing);
  if (!incoming || typeof incoming !== "object") {
    return base;
  }

  const next = ensureSection(incoming);
  const selectedSet = new Set([...(base.selected || []), ...(next.selected || [])]);

  const providers = { ...base.providers };
  for (const [key, value] of Object.entries(next.providers || {})) {
    if (!value || typeof value !== "object") continue;
    providers[key] = providers[key] ? { ...providers[key], ...value } : { ...value };
  }

  for (const providerKey of Object.keys(providers)) {
    selectedSet.add(providerKey);
  }

  return {
    selected: Array.from(selectedSet),
    otherText: next.otherText || base.otherText || "",
    explanation: next.explanation || base.explanation || "",
    providers,
  };
}

function markProviderAuthorized(section, providerId, providerData = {}) {
  if (!providerId) {
    return ensureSection(section);
  }

  const base = ensureSection(section);
  const providers = { ...base.providers };
  const previous = providers[providerId] && typeof providers[providerId] === "object" ? providers[providerId] : {};

  const nowIso = new Date().toISOString();
  providers[providerId] = {
    ...previous,
    authorized: true,
    updated_at: providerData.updated_at || nowIso,
    granted_at: providerData.granted_at || previous.granted_at || nowIso,
    ...providerData,
  };

  const selectedSet = new Set(base.selected || []);
  selectedSet.add(providerId);

  return {
    selected: Array.from(selectedSet),
    otherText: base.otherText,
    explanation: base.explanation,
    providers,
  };
}

function encodeOAuthState(payload) {
  if (!payload || typeof payload !== "object") return "";
  try {
    const json = JSON.stringify(payload);
    return Buffer.from(json, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  } catch (error) {
    return "";
  }
}

function decodeOAuthState(state) {
  if (!state || typeof state !== "string") {
    return null;
  }

  try {
    const normalized = state.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + "=".repeat(padLength);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    // fall back below
  }

  const fallbackParts = state.split(":");
  if (fallbackParts.length >= 2) {
    const [uid, column] = fallbackParts;
    if (uid && column) {
      return { uid, column };
    }
  }

  return null;
}

module.exports = {
  DEFAULT_SECTION,
  ensureSection,
  mergeSections,
  markProviderAuthorized,
  encodeOAuthState,
  decodeOAuthState,
};
