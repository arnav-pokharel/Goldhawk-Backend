const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

//
// Generate presigned upload + download URLs
//
exports.generatePresignedUrls = async (req, res) => {
  const { uid, key, contentType } = req.body;

  if (!uid || !key || !contentType) {
    return res.status(400).json({ error: "uid, key, and contentType are required" });
  }

  try {
    const s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const bucketName = process.env.S3_BUCKET_NAME;

    // Upload URL
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn: 3600 });

    // Download URL
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const downloadUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });

    return res.json({
      uploadUrl,
      downloadUrl,
      publicUrl: `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    });
  } catch (err) {
    console.error("Error generating presigned URLs:", err);
    return res.status(500).json({ error: "Could not generate presigned URLs" });
  }
};
