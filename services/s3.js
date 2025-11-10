require("dotenv").config();

const fs = require('fs');
const { createPrivateKey } = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { getSignedUrl: getCloudfrontSignedUrlFunc } = require("@aws-sdk/cloudfront-signer");
const { STORAGE_BUCKET } = require("../utils/appConfig");

// Create S3 client (AWS SDK v3)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const MEDIA_BUCKET = process.env.S3_BUCKET_NAME || STORAGE_BUCKET;

// Upload a file buffer to S3 using PutObjectCommand
exports.uploadFile = async (buffer, key, mimetype) => {
  const params = {
    Bucket: MEDIA_BUCKET,
    Key: key, // e.g., "founder/uid/pitch/pitchDeck.pdf"
    Body: buffer,
    ContentType: mimetype,
  };

  try {
    const cmd = new PutObjectCommand(params);
    const result = await s3Client.send(cmd);
    // Construct a best-effort Location URL for convenience
    // Encode each path segment but keep slashes so the URL path structure is preserved
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    // Construct public URL (use regional domain if AWS_REGION provided)
    const bucket = MEDIA_BUCKET;
    const region = process.env.AWS_REGION;
    const location = region
      ? `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`
      : `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
    return { ...result, Bucket: MEDIA_BUCKET, Key: key, Location: location };
  } catch (err) {
    console.error("❌ S3 Upload Failed:", err);
    throw err;
  }
};

// Upload to an explicit bucket (allows uploading to persona verification bucket)
exports.uploadFileToBucket = async (buffer, key, mimetype, bucketName, makePublic = false) => {
  if (!bucketName) throw new Error('bucketName required');
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  };
  // We rely on bucket policy for public access (do not set ACL here).

  try {
    const cmd = new PutObjectCommand(params);
    const result = await s3Client.send(cmd);
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const region = process.env.AWS_REGION;
    const location = region
      ? `https://${bucketName}.s3.${region}.amazonaws.com/${encodedKey}`
      : `https://${bucketName}.s3.amazonaws.com/${encodedKey}`;
    return { ...result, Bucket: bucketName, Key: key, Location: location };
  } catch (err) {
    console.error("❌ S3 Upload to bucket Failed:", err);
    throw err;
  }
};

// Convenience wrapper for uploading a public persona verification copy
exports.uploadPersonaPublicFile = async (buffer, key, mimetype) => {
  const personaBucket = process.env.PERSONA_BUCKET_NAME || MEDIA_BUCKET;
  // Upload as public-read so Persona can fetch it
  return exports.uploadFileToBucket(buffer, key, mimetype, personaBucket, true);
};

// Generate a presigned GET URL for an object key
exports.getSignedUrlForKey = async (key, expiresInSeconds = 300) => {
  if (!key) throw new Error("S3 key required");
  try {
    const cmd = new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: key });
    const url = await getSignedUrl(s3Client, cmd, { expiresIn: expiresInSeconds });
    return url;
  } catch (err) {
    console.error("❌ Failed to create signed URL:", err);
    throw err;
  }
};

// Create a signed CloudFront URL for a given object path (key) or full path
// Requires env vars: CLOUDFRONT_DOMAIN and CLOUDFRONT_KEY_PAIR_ID and a private key file at keys/private_key.pem
exports.getCloudFrontSignedUrl = (pathOrUrl, expiresInSeconds = 300) => {
  if (!process.env.CLOUDFRONT_DOMAIN) throw new Error('CLOUDFRONT_DOMAIN not configured');
  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  if (!keyPairId) throw new Error('CLOUDFRONT_KEY_PAIR_ID not configured');

  // Build absolute URL if a key was passed
  let url = pathOrUrl;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    // FIX: Do not use encodeURIComponent on the entire path.
    // The path should be appended as-is. The signer library handles encoding.
    url = `https://${process.env.CLOUDFRONT_DOMAIN}/${pathOrUrl}`;
  }

  // Load private key
  const privKeyPath = process.env.CLOUDFRONT_PRIVATE_KEY_PATH || `${__dirname}/../keys/private_key.pem`;
  let privateKey;
  try {
    privateKey = fs.readFileSync(privKeyPath, 'utf8');
  } catch (err) {
    console.error('Failed to read CloudFront private key at', privKeyPath, err);
    throw err;
  }

  // If the key is in PKCS#8 format (-----BEGIN PRIVATE KEY-----) convert it to PKCS#1 RSA PEM
  // because CloudFront signer expects an RSA key format. Use Node's crypto to convert.
  try {
    if (privateKey.includes('-----BEGIN PRIVATE KEY-----') && !privateKey.includes('-----BEGIN RSA PRIVATE KEY-----')) {
      const keyObj = createPrivateKey({ key: privateKey, format: 'pem' });
      const pkcs1 = keyObj.export({ type: 'pkcs1', format: 'pem' });
      privateKey = pkcs1.toString();
      // Note: we do not overwrite the file on disk; conversion is in-memory.
    }
  } catch (err) {
    console.error('Failed to convert private key to RSA PKCS#1 format', err);
    // continue and let underlying signer produce its own error if still invalid
  }

  // getCloudfrontSignedUrlFunc expects an options object; expires can be provided as a Unix timestamp
  const expires = Math.floor(Date.now() / 1000) + Number(expiresInSeconds || 300);

  try {
    const signed = getCloudfrontSignedUrlFunc({ url, keyPairId, privateKey, expires });
    return signed;
  } catch (err) {
    console.error('Failed to create CloudFront signed URL', err);
    throw err;
  }
};

// Create default folder structure for a new founder
exports.createFounderS3Folders = async (uid) => {
  const folders = [
    `founder/${uid}/flowdeck/`,
    `founder/${uid}/documents/`,
    `founder/${uid}/validation/`,
    `founder/${uid}/profile/`,
  ];

  try {
    for (const folder of folders) {
      const cmd = new PutObjectCommand({
        Bucket: MEDIA_BUCKET,
        Key: folder,
        Body: "",
      });
      await s3Client.send(cmd);
    }
    console.log(`✅ Created S3 folders for founder: ${uid}`);
  } catch (err) {
    console.error("❌ S3 Folder Creation Failed:", err);
    throw err;
  }
};

// Create default folder structure for a new angel investor
exports.createAngelS3Folders = async (uid) => {
  const folders = [
    `ang_investor/${uid}/profile/`,
    `ang_investor/${uid}/documents/`,
  ];

  try {
    for (const folder of folders) {
      const cmd = new PutObjectCommand({
        Bucket: MEDIA_BUCKET,
        Key: folder,
        Body: "",
      });
      await s3Client.send(cmd);
    }
    console.log(`✓ Created S3 folders for angel_investor: ${uid}`);
  } catch (err) {
    console.error("S3 Angel Folder Creation Failed:", err);
    throw err;
  }
};

// Create folder in S3 (S3 doesn't have real folders, so we create empty objects with trailing slash)
exports.CreateFolder = async (folderPath) => {
  try {
    // Ensure the folder path ends with a slash
    const normalizedPath = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;

    const params = {
      Bucket: MEDIA_BUCKET,
      Key: normalizedPath, // This creates a "folder" in S3
      Body: "", // Empty body for folder
    };

    const cmd = new PutObjectCommand(params);
    const result = await s3Client.send(cmd);

    console.log(`Created S3 folder: ${normalizedPath}`);
    return result;
  } catch (err) {
    console.error("S3 Folder Creation Failed:", err);
    throw err;
  }
};

// Create multiple folders at once
exports.createVCFirmS3Folders = async (uid) => {
  const bucketPrefix = MEDIA_BUCKET;
  const folders = [
    `${bucketPrefix}/vc_firm/${uid}/`,
    `${bucketPrefix}/vc_firm/${uid}/admin/`,
    `${bucketPrefix}/vc_firm/${uid}/associates/`,
    `${bucketPrefix}/vc_firm/${uid}/general_partner/`,
  ];

  try {
    for (const folder of folders) {
      await exports.CreateFolder(folder);
    }
    console.log(`Created all S3 folders for VC firm: ${uid}`);
  } catch (err) {
    console.error("VC Firm S3 Folder Creation Failed:", err);
    throw err;
  }
};
// Export client for advanced operations if needed
exports.s3Client = s3Client;

// Generate a presigned GET URL for an explicit bucket+key (e.g., MEDIA_BUCKET private bucket)
exports.getSignedUrlForObject = async (bucket, key, expiresInSeconds = 300) => {
  if (!bucket) throw new Error('bucket required');
  if (!key) throw new Error('key required');
  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(s3Client, cmd, { expiresIn: expiresInSeconds });
    return url;
  } catch (err) {
    console.error('Failed to create signed URL for object', bucket, key, err);
    throw err;
  }
};

// Public URL: always S3 presigned (short‑lived), never CloudFront
exports.getPublicUrl = async (bucket, key, expiresInSeconds = 300) => {
  return exports.getSignedUrlForObject(bucket, key, expiresInSeconds);
};

// Private URL: CloudFront signed URL (fallback to S3 presign if CF not configured)
exports.getPrivateUrl = async (key, expiresInSeconds = 3600) => {
  const domain = process.env.CLOUDFRONT_DIST_DOMAIN || process.env.CLOUDFRONT_DOMAIN;
  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  const hasCF = Boolean(domain && keyPairId && (process.env.CLOUDFRONT_PRIVATE_KEY || process.env.CLOUDFRONT_PRIVATE_KEY_PATH));
  if (!hasCF) {
    // Fallback to S3 presign
    return exports.getSignedUrlForKey(key, expiresInSeconds);
  }

  const url = `https://${domain}/${key}`;
  let privateKey = process.env.CLOUDFRONT_PRIVATE_KEY ? process.env.CLOUDFRONT_PRIVATE_KEY.replace(/\\n/g, '\n') : null;
  if (!privateKey) {
    const privKeyPath = process.env.CLOUDFRONT_PRIVATE_KEY_PATH || `${__dirname}/../keys/private_key.pem`;
    privateKey = fs.readFileSync(privKeyPath, 'utf8');
  }
  try {
    if (privateKey.includes('-----BEGIN PRIVATE KEY-----') && !privateKey.includes('-----BEGIN RSA PRIVATE KEY-----')) {
      const keyObj = createPrivateKey({ key: privateKey, format: 'pem' });
      privateKey = keyObj.export({ type: 'pkcs1', format: 'pem' }).toString();
    }
  } catch (_) { }

  const dateLessThan = new Date(Date.now() + Number(expiresInSeconds || 3600) * 1000).toISOString();
  const signed = getCloudfrontSignedUrlFunc({ url, keyPairId, privateKey, dateLessThan });
  return signed;
};
