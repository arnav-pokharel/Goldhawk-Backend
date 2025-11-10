const fs = require('fs');
const path = require('path');
const { getSignedCookie } = require('@aws-sdk/cloudfront-signer');

function readPrivateKey() {
  const keyPath = process.env.CLOUDFRONT_PRIVATE_KEY_PATH;
  if (!keyPath) throw new Error('CLOUDFRONT_PRIVATE_KEY_PATH not set');
  const abs = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath);
  return fs.readFileSync(abs, 'utf8');
}

function getCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  const domain = process.env.CLOUDFRONT_COOKIE_DOMAIN || undefined; // e.g., .example.com
  // For cross-site video loads (media.<domain>), cookies must be SameSite=None; Secure
  return {
    httpOnly: false,
    secure: isProd,
    sameSite: 'none',
    domain, // ensure this is a parent domain like .example.com
    path: '/',
  };
}

// Issue CloudFront signed cookies for the configured domain wildcard
// Returns { cookies, expiresAt }
function issueCloudFrontCookies() {
  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  const privateKey = readPrivateKey();
  const domain = process.env.CLOUDFRONT_DOMAIN; // e.g., dxxxx.cloudfront.net
  if (!keyPairId || !domain) throw new Error('CLOUDFRONT_KEY_PAIR_ID and CLOUDFRONT_DOMAIN required');

  const now = Date.now();
  const ttlMs = Number(process.env.CLOUDFRONT_COOKIE_TTL_MS || 6 * 60 * 60 * 1000); // default 6h
  const expires = new Date(now + ttlMs);

  // Wildcard to cover all objects on the distribution
  const url = `https://${domain}/*`;

  const cookies = getSignedCookie({
    url,
    keyPairId,
    privateKey,
    dateLessThan: expires,
  });

  return { cookies, expiresAt: expires };
}

function setCloudFrontCookies(res) {
  const { cookies, expiresAt } = issueCloudFrontCookies();
  const opts = { ...getCookieOptions(), expires: expiresAt };

  // Set three cookies: Key-Pair-Id, Policy (or Expires), Signature
  // @aws-sdk/cloudfront-signer uses names: CloudFront-Policy, CloudFront-Signature, CloudFront-Key-Pair-Id
  res.cookie('CloudFront-Policy', cookies['CloudFront-Policy'], opts);
  res.cookie('CloudFront-Signature', cookies['CloudFront-Signature'], opts);
  res.cookie('CloudFront-Key-Pair-Id', cookies['CloudFront-Key-Pair-Id'], opts);
}

module.exports = { issueCloudFrontCookies, setCloudFrontCookies };
