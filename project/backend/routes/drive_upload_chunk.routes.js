// Chunked upload backend for /api/drive/upload-chunk (files > 10 MB)

const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { once } = require('events');
const { pipeline } = require('stream/promises');
const { verifyToken } = require('../auth');
const db = require('../db');
const { sanitizeFilename, validateId } = require('../validators');

const UPLOAD_DIR = process.env.DRIVE_ROOT || path.join(__dirname, '../../storage/drive_storage');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_TOTAL_CHUNKS = 2000; // 2000 x 10 MB = 20 GB ceiling

const selectFolder = db.prepare('SELECT id, type FROM drive_items WHERE id = ?');
const insertFile = db.prepare("INSERT INTO drive_items (name, type, parent_id, mime_type, file_size, file_path, created_by) VALUES (?, 'file', ?, ?, ?, ?, ?)");

const chunkPathFor = (uploadId, i) => path.join(UPLOAD_DIR, `${uploadId}_chunk_${i}`);

function decodeHeader(value) {
  const raw = String(value || '');
  try { return decodeURIComponent(raw); } catch (_) { return raw; }
}

// POST /api/drive/upload-chunk
router.post('/upload-chunk', verifyToken, async (req, res) => {
  const chunkNumber = Number(req.headers['x-chunk-number']);
  const totalChunks = Number(req.headers['x-total-chunks']);
  // The client URI-encodes the name so non-ASCII characters survive the HTTP header.
  const originalName = path.basename(decodeHeader(req.headers['x-file-name']).replace(/\\/g, '/')).trim().slice(0, 255);
  const safeName = sanitizeFilename(originalName).replace(/\.\.+/g, '.');
  const uploadId = String(req.headers['x-upload-id'] || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const rawParentId = req.headers['x-parent-id'];

  if (!originalName || !safeName || !uploadId) return res.status(400).json({ message: 'Missing fileName or uploadId' });
  if (!Number.isInteger(chunkNumber) || !Number.isInteger(totalChunks) || chunkNumber < 0 || totalChunks < 1 || totalChunks > MAX_TOTAL_CHUNKS || chunkNumber >= totalChunks) {
    return res.status(400).json({ message: 'Invalid chunk metadata' });
  }

  let parentId = null;
  if (rawParentId && rawParentId !== 'null' && rawParentId !== 'undefined') {
    const v = validateId(rawParentId, 'Parent ID');
    const folder = v.valid ? selectFolder.get(v.value) : null;
    if (!folder || folder.type !== 'folder') {
      req.resume();
      return res.status(404).json({ message: 'Parent folder does not exist. It may have been deleted - please refresh.' });
    }
    parentId = v.value;
  }

  try {
    await pipeline(req, fs.createWriteStream(chunkPathFor(uploadId, chunkNumber)));
  } catch (err) {
    console.error('Chunk write stream error:', err);
    return res.status(500).json({ message: 'Failed to write chunk' });
  }

  if (chunkNumber !== totalChunks - 1) return res.json({ message: 'Chunk received' });

  // Last chunk: stream all chunks into a uniquely named file (never overwrite another upload).
  const storedName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeName}`;
  const finalPath = path.join(UPLOAD_DIR, storedName);
  try {
    for (let i = 0; i < totalChunks; i++) {
      if (!fs.existsSync(chunkPathFor(uploadId, i))) {
        return res.status(400).json({ message: `Missing chunk ${i}; please retry the upload` });
      }
    }
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(finalPath);
      out.on('error', reject);
      out.on('finish', resolve);
      (async () => {
        for (let i = 0; i < totalChunks; i++) {
          for await (const buf of fs.createReadStream(chunkPathFor(uploadId, i))) {
            if (!out.write(buf)) await once(out, 'drain');
          }
        }
        out.end();
      })().catch(err => { out.destroy(); reject(err); });
    });
    const totalSize = fs.statSync(finalPath).size;
    for (let i = 0; i < totalChunks; i++) fs.unlink(chunkPathFor(uploadId, i), () => {});

    const mimeType = require('mime-types').lookup(originalName) || 'application/octet-stream';
    const result = insertFile.run(originalName, parentId, mimeType, totalSize, storedName, req.user.id);
    res.json({ message: 'Upload complete', file: originalName, id: result.lastInsertRowid });
  } catch (err) {
    console.error('Chunk assembly error:', err);
    fs.unlink(finalPath, () => {});
    res.status(500).json({ message: 'Failed to assemble file' });
  }
});

// GET /api/drive/upload-chunk/status?uploadId=...&totalChunks=...
router.get('/upload-chunk/status', verifyToken, (req, res) => {
  const uploadId = String(req.query.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const totalChunks = Number(req.query.totalChunks);
  if (!uploadId || !Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > MAX_TOTAL_CHUNKS) {
    return res.status(400).json({ message: 'Missing uploadId or totalChunks' });
  }
  const uploaded = [];
  for (let i = 0; i < totalChunks; i++) {
    if (fs.existsSync(chunkPathFor(uploadId, i))) uploaded.push(i);
  }
  res.json({ uploaded });
});

module.exports = router;
