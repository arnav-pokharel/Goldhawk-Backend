const DEFAULT_APP_NAME = "fundfy";
const DEFAULT_STORAGE_PREFIX = "fundfy";
const DEFAULT_TAGLINE = "Secure Investment Platform";
const DEFAULT_SUPPORT_EMAIL = "support@fund-fy.com";
const DEFAULT_NO_REPLY_EMAIL = "no-reply@example.com";
const DEFAULT_BACKEND_URL = "https://backend.example.com";
const DEFAULT_FRONTEND_URL = "https://app.example.com";
const DEFAULT_BUCKET = "app-media";

function pickEnvValue(...values) {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const appName =
  pickEnvValue(process.env.APP_NAME, process.env.NAME, DEFAULT_APP_NAME) || DEFAULT_APP_NAME;

const explicitPrefix = pickEnvValue(
  process.env.APP_PREFIX,
  process.env.STORAGE_PREFIX,
  process.env.COOKIE_PREFIX,
  process.env.NAME,
  appName,
);

const inferredPrefix = toSlug(explicitPrefix || appName) || DEFAULT_STORAGE_PREFIX;

const cookiePrefixes = Array.from(
  new Set([inferredPrefix, DEFAULT_STORAGE_PREFIX]),
);

const sessionCookieName =
  pickEnvValue(process.env.SESSION_COOKIE_NAME) || `${inferredPrefix}_session`;
const uidCookieName =
  pickEnvValue(process.env.UID_COOKIE_NAME) || `${inferredPrefix}_uid`;

const sessionCookieNames = Array.from(
  new Set([sessionCookieName, ...cookiePrefixes.map(prefix => `${prefix}_session`)]),
);

const uidCookieNames = Array.from(
  new Set([
    uidCookieName,
    ...cookiePrefixes.map(prefix => `${prefix}_uid`),
    "uid",
  ]),
);

const supportEmail =
  pickEnvValue(
    process.env.SUPPORT_EMAIL,
    process.env.SMTP_FROM,
    process.env.SMTP_USER,
    DEFAULT_SUPPORT_EMAIL,
  ) || DEFAULT_SUPPORT_EMAIL;

const noReplyEmail =
  pickEnvValue(
    process.env.SMTP_FROM,
    process.env.SMTP_USER,
    DEFAULT_NO_REPLY_EMAIL,
  ) || DEFAULT_NO_REPLY_EMAIL;

const companyLegalName =
  pickEnvValue(process.env.COMPANY_LEGAL_NAME, `${appName} Inc.`) || `${appName} Inc.`;

const appTagline =
  pickEnvValue(process.env.APP_TAGLINE, DEFAULT_TAGLINE) || DEFAULT_TAGLINE;

const backendUrl =
  pickEnvValue(
    process.env.BACKEND_URL,
    process.env.APP_ORIGIN,
    process.env.API_BASE_URL,
    DEFAULT_BACKEND_URL,
  ) || DEFAULT_BACKEND_URL;

const frontendUrl =
  pickEnvValue(
    process.env.FRONTEND_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_FRONTEND_URL,
    DEFAULT_FRONTEND_URL,
  ) || DEFAULT_FRONTEND_URL;

const storageBucket =
  pickEnvValue(
    process.env.S3_BUCKET_NAME,
    process.env.MEDIA_BUCKET_NAME,
    DEFAULT_BUCKET,
  ) || DEFAULT_BUCKET;

const brandTemplateDefaults = Object.freeze({
  APP_NAME: appName,
  APP_TAGLINE: appTagline,
  COMPANY_LEGAL_NAME: companyLegalName,
  SUPPORT_EMAIL: supportEmail,
  SUPPORT_URL: pickEnvValue(process.env.SUPPORT_URL, supportEmail ? `mailto:${supportEmail}` : undefined) || "",
  BACKEND_URL: backendUrl,
  FRONTEND_URL: frontendUrl,
});

function cookieNameCandidates(suffix) {
  if (!suffix) return [];
  return Array.from(
    new Set([
      ...cookiePrefixes.map(prefix => `${prefix}_${suffix}`),
      suffix === "uid" ? "uid" : undefined,
    ].filter(Boolean)),
  );
}

module.exports = {
  APP_NAME: appName,
  COMPANY_LEGAL_NAME: companyLegalName,
  APP_TAGLINE: appTagline,
  SUPPORT_EMAIL: supportEmail,
  NO_REPLY_EMAIL: noReplyEmail,
  BACKEND_URL: backendUrl,
  FRONTEND_URL: frontendUrl,
  STORAGE_BUCKET: storageBucket,
  COOKIE_PREFIX: inferredPrefix,
  COOKIE_PREFIXES: cookiePrefixes,
  SESSION_COOKIE_NAME: sessionCookieName,
  UID_COOKIE_NAME: uidCookieName,
  SESSION_COOKIE_NAMES: sessionCookieNames,
  UID_COOKIE_NAMES: uidCookieNames,
  cookieNameCandidates,
  brandTemplateDefaults,
  pickEnvValue,
  toSlug,
};
