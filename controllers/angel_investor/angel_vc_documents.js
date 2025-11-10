const { s3, cloudfrontDomain } = require('../config/aws');
const prisma = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const angel_getDocuments = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's VC firm
    const vcFirm = await prisma.vcFirm.findFirst({
      where: { users: { some: { id: userId } } },
      include: {
        documents: true
      }
    });

    if (!vcFirm) {
      return res.status(404).json({
        success: false,
        message: 'VC firm not found'
      });
    }

    res.status(200).json({
      success: true,
      data: vcFirm.documents
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const angel_generateUploadURL = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileName, fileType } = req.body;
    
    // Get user's VC firm
    const vcFirm = await prisma.vcFirm.findFirst({
      where: { users: { some: { id: userId } } }
    });

    if (!vcFirm) {
      return res.status(404).json({
        success: false,
        message: 'VC firm not found'
      });
    }

    const key = `VC/${vcFirm.id}/documents/${uuidv4()}-${fileName}`;
    
    const s3Params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      Expires: 60 * 5 // 5 minutes
    };

    const uploadURL = await s3.getSignedUrlPromise('putObject', s3Params);
    const fileURL = `https://${cloudfrontDomain}/${key}`;

    res.status(200).json({
      success: true,
      uploadURL,
      fileURL,
      key
    });
  } catch (error) {
    console.error('Generate upload URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const angel_saveDocument = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, s3Key, url, type, size } = req.body;
    
    // Get user's VC firm
    const vcFirm = await prisma.vcFirm.findFirst({
      where: { users: { some: { id: userId } } }
    });

    if (!vcFirm) {
      return res.status(404).json({
        success: false,
        message: 'VC firm not found'
      });
    }

    // Save document metadata to database
    const document = await prisma.vcDocument.create({
      data: {
        firmUid: vcFirm.id,
        name,
        s3Key,
        url,
        type,
        size: parseInt(size),
        uploadedBy: userId
      }
    });

    res.status(201).json({
      success: true,
      message: 'Document saved successfully',
      data: document
    });
  } catch (error) {
    console.error('Save document error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  angel_getDocuments,
  angel_generateUploadURL,
  angel_saveDocument
};