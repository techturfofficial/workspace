// Chunked upload backend for /api/drive/upload-chunk
// Place in backend/routes/drive_upload_chunk.routes.js

const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../auth');
const db = require('../db');
const { sanitizeFilename } = require('../validators');

const UPLOAD_DIR = path.join(__dirname, '../../storage/drive_storage');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// POST /api/drive/upload-chunk
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
const writeFile = promisify(fs.writeFile);

// POST /api/drive/upload-chunk
router.post('/upload-chunk', verifyToken, async (req, res) => {
  const chunkNumber = Number(req.headers['x-chunk-number']);
  const totalChunks = Number(req.headers['x-total-chunks']);
  const fileName = sanitizeFilename(path.basename(String(req.headers['x-file-name'] || '')));
  const uploadId = String(req.headers['x-upload-id'] || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const rawParentId = req.headers['x-parent-id'];
  const parentId = (rawParentId && rawParentId !== 'null' && rawParentId !== 'undefined' && rawParentId !== '') ? (Number(rawParentId) || null) : null;
  if (!fileName || !uploadId) return res.status(400).json({ message: 'Missing fileName or uploadId' });
  if (!Number.isInteger(chunkNumber) || !Number.isInteger(totalChunks) || chunkNumber < 0 || totalChunks < 1 || chunkNumber >= totalChunks) {
    return res.status(400).json({ message: 'Invalid chunk metadata' });
  }

  const chunkPath = path.join(UPLOAD_DIR, `${uploadId}_chunk_${chunkNumber}`);
  const writeStream = fs.createWriteStream(chunkPath);
  req.pipe(writeStream);
  writeStream.on('finish', async () => {
    if (chunkNumber === totalChunks - 1) {
      // Assemble file asynchronously
      try {
        const finalPath = path.join(UPLOAD_DIR, fileName);
        let totalSize = 0;
        const out = fs.createWriteStream(finalPath);
        for (let i = 0; i < totalChunks; i++) {
          const chunkFile = path.join(UPLOAD_DIR, `${uploadId}_chunk_${i}`);
          const chunk = await readFile(chunkFile);
          totalSize += chunk.length;
          out.write(chunk);
          await unlink(chunkFile);
        }
        out.end();
        out.on('finish', () => {
          try {
            const mimeType = require('mime-types').lookup(fileName) || 'application/octet-stream';
            const result = db.prepare('INSERT INTO drive_items (name, type, parent_id, mime_type, file_size, file_path, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
              fileName,
              'file',
              parentId,
              mimeType,
              totalSize,
              fileName,
              req.user.id
            );
            res.json({ message: 'Upload complete', file: fileName, id: result.lastInsertRowid });
          } catch (e) {
            console.error('Chunk upload DB write error:', e);
            res.status(500).json({ message: 'Upload succeeded but indexing failed' });
          }
        });
      } catch (err) {
        console.error('Chunk assembly error:', err);
        res.status(500).json({ message: 'Failed to assemble file' });
      }
    } else {
      res.json({ message: 'Chunk received' });
    }
  });
  writeStream.on('error', err => {
    console.error('Chunk write stream error:', err);
    res.status(500).json({ message: 'Failed to write chunk' });
  });
});

// GET /api/drive/upload-chunk/status?uploadId=...&totalChunks=...
router.get('/upload-chunk/status', verifyToken, async (req, res) => {
  const uploadId = req.query.uploadId;
  const totalChunks = Number(req.query.totalChunks);
  if (!uploadId || isNaN(totalChunks)) return res.status(400).json({ message: 'Missing uploadId or totalChunks' });
  try {
    const files = await readdir(UPLOAD_DIR);
    const uploaded = [];
    for (let i = 0; i < totalChunks; i++) {
      if (files.includes(`${uploadId}_chunk_${i}`)) uploaded.push(i);
    }
    res.json({ uploaded });
  } catch (e) {
    console.error('Chunk status error:', e);
    res.status(500).json({ message: 'Failed to check chunk status' });
  }
});

module.exports = router;
