const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const uploadDir = path.join(__dirname, '..', '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Allowlist: only permit known-safe file types
    const allowedExt = /\.(txt|js|json|py|html|css|md|csv|log|c|cpp|java|pdf|doc|docx|ppt|pptx|xls|xlsx|jpg|jpeg|png|gif|webp)$/i;
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExt.test(ext)) {
      return cb(new Error(`File type "${ext || 'unknown'}" is not allowed`), false);
    }
    cb(null, true);
  }
});

// Upload up to 5 files
router.post('/', upload.array('files', 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const files = req.files.map(f => ({
      id: path.basename(f.filename, path.extname(f.filename)),
      name: f.originalname,
      size: f.size,
      type: f.mimetype,
      url: `/uploads/${f.filename}`
    }));
    res.json({ files });
  } catch (err) {
    console.error('[upload] Error:', err.message);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Max 10MB per file.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

module.exports = router;
