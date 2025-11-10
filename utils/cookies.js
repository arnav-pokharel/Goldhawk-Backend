const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const {
  SESSION_COOKIE_NAME,
  UID_COOKIE_NAME,
  SESSION_COOKIE_NAMES,
  UID_COOKIE_NAMES,
} = require('./appConfig');

const truthyValues = new Set(["true", "1", "yes", "y", "on"]);
const falsyValues = new Set(["false", "0", "no", "n", "off"]);

function parseBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return fallback;
  const lower = String(value).toLowerCase();
  if (truthyValues.has(lower)) return true;
  if (falsyValues.has(lower)) return false;
  return fallback;
}

function normalizeSameSite(value, domainDefined) {
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      return "none";
    }
    return domainDefined ? "none" : "lax";
  }
  const lower = String(value).toLowerCase();
  if (lower === "strict" || lower === "lax" || lower === "none") {
    return lower;
  }
  return domainDefined ? "none" : "lax";
}

function toFiniteNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Build cookie options that respect production cross-site requirements.
 * Values can be customised via environment variables or the overrides object.
 */
function buildCookieOptions(overrides = {}) {
  const domainEnv = process.env.COOKIE_DOMAIN || process.env.SESSION_COOKIE_DOMAIN;
  const domain = overrides.domain ?? domainEnv ?? undefined;

  const sameSite = normalizeSameSite(overrides.sameSite ?? process.env.COOKIE_SAMESITE, !!domain);

  let secure = overrides.secure;
  if (typeof secure !== "boolean") {
    secure = parseBoolean(process.env.COOKIE_SECURE, process.env.NODE_ENV === "production");
  }
  if (sameSite === "none") {
    secure = true; // SameSite=None requires Secure
  }

  const maxAge = toFiniteNumber(
    overrides.maxAge ?? process.env.SESSION_COOKIE_MAX_AGE,
    DEFAULT_MAX_AGE
  );

  const httpOnly = overrides.httpOnly ?? true;
  const path = overrides.path ?? "/";
  const signed = overrides.signed ?? false;

  const options = {
    httpOnly,
    secure,
    sameSite,
    maxAge,
    path,
  };

  if (domain) options.domain = domain;
  if (signed) options.signed = true;
  if (overrides.expires) options.expires = overrides.expires;

  return options;
}

function setSessionCookie(res, value, overrides = {}) {
  res.cookie(SESSION_COOKIE_NAME, value, buildCookieOptions({ signed: true, ...overrides }));
}

function setUidCookie(res, value, overrides = {}) {
  res.cookie(UID_COOKIE_NAME, value, buildCookieOptions({ httpOnly: false, ...overrides }));
}

function clearSessionCookies(res) {
  for (const name of SESSION_COOKIE_NAMES) {
    res.clearCookie(name, buildCookieOptions());
    res.clearCookie(name, buildCookieOptions({ signed: true }));
  }
}

function clearUidCookies(res) {
  for (const name of UID_COOKIE_NAMES) {
    res.clearCookie(name, buildCookieOptions({ httpOnly: false }));
  }
}

module.exports = {
  buildCookieOptions,
  DEFAULT_MAX_AGE,
  setSessionCookie,
  setUidCookie,
  clearSessionCookies,
  clearUidCookies,
  SESSION_COOKIE_NAME,
  UID_COOKIE_NAME,
  SESSION_COOKIE_NAMES,
  UID_COOKIE_NAMES,
};
