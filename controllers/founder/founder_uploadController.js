const pool = require("../../db/pool");

//
// SAVE or UPDATE uploaded file metadata (pitch_files table)
//
exports.saveUploadMetadata = async (req, res) => {
  const { uid, fileName, fileType, s3_url } = req.body;

  if (!uid || !fileName || !fileType || !s3_url) {
    return res.status(400).json({ error: "uid, fileName, fileType, and s3_url are required" });
  }

  try {
    const exists = await pool.query(
      "SELECT id FROM pitch_files WHERE uid = $1 AND file_name = $2",
      [uid, fileName]
    );

    if (exists.rows.length > 0) {
      await pool.query(
        `UPDATE pitch_files
         SET s3_url = $1, file_type = $2, updated_at = NOW()
         WHERE uid = $3 AND file_name = $4`,
        [s3_url, fileType, uid, fileName]
      );
      return res.json({ message: "File metadata updated" });
    } else {
      await pool.query(
        `INSERT INTO pitch_files (uid, file_name, file_type, s3_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [uid, fileName, fileType, s3_url]
      );
      return res.status(201).json({ message: "File metadata created" });
    }
  } catch (err) {
    console.error("File metadata DB error:", err);
    return res.status(500).json({ error: "Could not save file metadata" });
  }
};

//
// GET all uploaded pitch files for a founder
//
exports.getUploadsByFounder = async (req, res) => {
  const { uid } = req.params;
  if (!uid) return res.status(400).json({ error: "uid required" });

  try {
    const result = await pool.query(
      "SELECT * FROM pitch_files WHERE uid = $1 ORDER BY created_at DESC",
      [uid]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("Error fetching uploads:", err);
    return res.status(500).json({ error: "Could not fetch uploads" });
  }
};
