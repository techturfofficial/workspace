const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const mammoth = require('mammoth');
const db = require('../db');
const { verifyToken, checkRole } = require('../auth');
const { validateId, validateString, sanitizeFilename } = require('../validators');

const DRIVE_ROOT = process.env.DRIVE_ROOT || path.join(__dirname, '../../storage/drive_storage');
if (!fs.existsSync(DRIVE_ROOT)) fs.mkdirSync(DRIVE_ROOT, { recursive: true });

// Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, DRIVE_ROOT);
  },
  filename: (req, file, cb) => {
    cb(null, storedFileName(file.originalname));
  }
});
// defParamCharset utf8: keep non-English file names intact (multer defaults to latin1).
const upload = multer({ storage, defParamCharset: 'utf8', limits: { fileSize: 100 * 1024 * 1024 } });

// Unique on-disk name. Timestamp alone collided when a folder upload sent several
// same-named files (e.g. "index.html" in different sub-folders) in the same millisecond.
function storedFileName(originalName) {
  const safeName = sanitizeFilename(path.basename(String(originalName || 'upload.bin'))).replace(/\.\.+/g, '.') || 'upload.bin';
  return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeName}`;
}

// Display name shown in the drive (original, unsanitized but path-free and bounded).
function displayName(originalName) {
  const base = path.basename(String(originalName || '').replace(/\\/g, '/')).trim();
  return (base || 'upload.bin').slice(0, 255);
}

const stmts = {
  itemById: db.prepare('SELECT * FROM drive_items WHERE id = ?'),
  folderById: db.prepare("SELECT id, type FROM drive_items WHERE id = ?"),
  listRoot: db.prepare('SELECT * FROM drive_items WHERE parent_id IS NULL ORDER BY type DESC, name ASC'),
  listChildren: db.prepare('SELECT * FROM drive_items WHERE parent_id = ? ORDER BY type DESC, name ASC'),
  findRootFolder: db.prepare("SELECT id FROM drive_items WHERE parent_id IS NULL AND type = 'folder' AND name = ? LIMIT 1"),
  findChildFolder: db.prepare("SELECT id FROM drive_items WHERE parent_id = ? AND type = 'folder' AND name = ? LIMIT 1"),
  insertFolder: db.prepare("INSERT INTO drive_items (name, type, parent_id, created_by) VALUES (?, 'folder', ?, ?)"),
  insertFile: db.prepare("INSERT INTO drive_items (name, type, parent_id, mime_type, file_size, file_path, created_by) VALUES (?, 'file', ?, ?, ?, ?, ?)")
};

const isEmptyParam = (v) => v === null || v === undefined || v === '' || v === 'null' || v === 'undefined';

/**
 * Validates an optional parent folder id. Returns { parentId } or { status, error }.
 * Every signed-in staff member may create folders / upload into any folder.
 */
function resolveParent(pId) {
  if (isEmptyParam(pId)) return { parentId: null };
  const pIdVal = validateId(pId, 'Parent ID');
  if (!pIdVal.valid) return { status: 400, error: 'Invalid parent folder ID' };
  const parentFolder = stmts.folderById.get(pIdVal.value);
  if (!parentFolder || parentFolder.type !== 'folder') {
    return { status: 404, error: 'Parent folder does not exist. It may have been deleted - please refresh.' };
  }
  return { parentId: pIdVal.value };
}

function removeStoredFile(fileName) {
  if (!fileName) return;
  fs.unlink(path.join(DRIVE_ROOT, fileName), () => {});
}

const isAdmin = (user) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const secondary = (user.secondary_roles || '').split(',').map(r => r.trim());
  return secondary.includes('admin');
};

const isLeaderOrAdmin = (user) => {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (user.role === 'team_leader') return true;
  const secondary = (user.secondary_roles || '').split(',').map(r => r.trim());
  return secondary.includes('team_leader');
};

const userCanAccessItem = (userId, itemId) => {
  if (!itemId) return true;
  // All authenticated staff members have collaborative access to Secure Drive items
  const item = db.prepare('SELECT id FROM drive_items WHERE id = ?').get(itemId);
  return !!item;
};

// List items with access control
router.get('/items', verifyToken, (req, res) => {
  const pId = req.query.parentId;
  try {
    // Two separate statements so SQLite can use the parent_id index (an OR'd
    // "parent_id = ? OR parent_id IS NULL" condition forced a full table scan).
    const items = isEmptyParam(pId) ? stmts.listRoot.all() : stmts.listChildren.all(pId);
    res.json(items);
  } catch (e) {
    console.error('List drive items error:', e);
    res.status(500).json({ error: 'Failed to load drive items' });
  }
});

// Create Folder - every signed-in staff member can create folders
router.post('/folder', verifyToken, (req, res) => {
  const { name, parentId: pId } = req.body || {};

  const nameVal = validateString(name, 'Folder name', { minLength: 1, maxLength: 120 });
  if (!nameVal.valid) return res.status(400).json({ error: nameVal.error });
  if (/[\\/]/.test(nameVal.value)) return res.status(400).json({ error: 'Folder name cannot contain / or \\' });

  const parent = resolveParent(pId);
  if (parent.error) return res.status(parent.status).json({ error: parent.error });

  try {
    const result = stmts.insertFolder.run(nameVal.value, parent.parentId, req.user.id);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    console.error('Create folder error:', e);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Ensure a folder tree exists (used by "Upload Folder"). Body:
//   { parentId, paths: ["Photos", "Photos/2026", "Photos/2026/Jan"] }
// Existing folders with the same name are reused, so re-uploading a folder merges into it.
// Returns { folders: { "<path>": id } }. Runs in one transaction -> one round trip.
router.post('/folders/ensure', verifyToken, (req, res) => {
  const { parentId: pId, paths } = req.body || {};
  if (!Array.isArray(paths) || paths.length === 0) return res.status(400).json({ error: 'paths must be a non-empty array' });
  if (paths.length > 5000) return res.status(400).json({ error: 'Too many folders in one upload (max 5000)' });

  const parent = resolveParent(pId);
  if (parent.error) return res.status(parent.status).json({ error: parent.error });

  // Normalise and validate every segment up front.
  const normalised = new Set();
  for (const raw of paths) {
    const segments = String(raw || '').replace(/\\/g, '/').split('/').map(s => s.trim()).filter(Boolean);
    if (!segments.length) continue;
    if (segments.length > 32) return res.status(400).json({ error: 'Folder nesting is too deep (max 32 levels)' });
    for (const seg of segments) {
      if (seg === '.' || seg === '..' || seg.length > 120) return res.status(400).json({ error: `Invalid folder name: ${seg.slice(0, 40)}` });
    }
    // Include every ancestor so "A/B/C" also creates "A" and "A/B".
    for (let i = 1; i <= segments.length; i++) normalised.add(segments.slice(0, i).join('/'));
  }

  try {
    const ensure = db.transaction(() => {
      const ids = {};
      const sorted = Array.from(normalised).sort((a, b) => a.split('/').length - b.split('/').length);
      for (const p of sorted) {
        const segments = p.split('/');
        const name = segments[segments.length - 1];
        const parentPath = segments.slice(0, -1).join('/');
        const parentFolderId = parentPath ? ids[parentPath] : parent.parentId;
        const existing = parentFolderId === null
          ? stmts.findRootFolder.get(name)
          : stmts.findChildFolder.get(parentFolderId, name);
        ids[p] = existing ? existing.id : Number(stmts.insertFolder.run(name, parentFolderId, req.user.id).lastInsertRowid);
      }
      return ids;
    });
    res.json({ success: true, folders: ensure() });
  } catch (e) {
    console.error('Ensure folders error:', e);
    res.status(500).json({ error: 'Failed to create folders' });
  }
});

// Upload File - every signed-in staff member can upload files
router.post('/upload', verifyToken, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is larger than 100 MB' });
    console.error('Upload parse error:', err);
    return res.status(400).json({ error: err.message || 'Upload failed' });
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const parent = resolveParent((req.body || {}).parentId);
  if (parent.error) {
    removeStoredFile(req.file.filename);
    return res.status(parent.status).json({ error: parent.error });
  }

  try {
    const result = stmts.insertFile.run(
      displayName(req.file.originalname),
      parent.parentId,
      req.file.mimetype,
      req.file.size,
      req.file.filename,
      req.user.id
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    console.error('Upload error:', e);
    removeStoredFile(req.file.filename);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Share Item (Single or Multi-employee)
router.post('/share', verifyToken, checkRole('admin'), (req, res) => {
  const { itemId, userId, userIds, accessLevel } = req.body;
  const itemIdVal = validateId(itemId, 'Item ID');
  if (!itemIdVal.valid) return res.status(400).json({ error: 'Item ID required' });

  // Gather user IDs (supports both array userIds and single userId)
  let ids = [];
  if (Array.isArray(userIds)) {
    for (const uid of userIds) {
      const v = validateId(uid, 'User ID');
      if (v.valid) ids.push(v.value);
    }
  } else if (userId !== undefined && userId !== null && userId !== '') {
    const v = validateId(userId, 'User ID');
    if (v.valid) ids.push(v.value);
  }

  if (ids.length === 0) {
    return res.status(400).json({ error: 'At least one valid employee must be selected' });
  }

  const level = accessLevel === 'editor' ? 'editor' : 'viewer';
  
  try {
    const insertStmt = db.prepare(`
      INSERT INTO drive_access (item_id, user_id, access_level) 
      VALUES (?, ?, ?) 
      ON CONFLICT(item_id, user_id) 
      DO UPDATE SET access_level = excluded.access_level
    `);

    const insertMany = db.transaction((iId, uIds, lvl) => {
      for (const uId of uIds) {
        insertStmt.run(iId, uId, lvl);
      }
    });

    insertMany(itemIdVal.value, ids, level);
    res.json({ success: true, count: ids.length });
  } catch (e) {
    console.error('Share error:', e);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// Revoke / Delete Share Permission
router.delete('/share/:itemId/:userId', verifyToken, checkRole('admin'), (req, res) => {
  const itemIdVal = validateId(req.params.itemId, 'Item ID');
  const userIdVal = validateId(req.params.userId, 'User ID');
  if (!itemIdVal.valid || !userIdVal.valid) return res.status(400).json({ error: 'Item ID and User ID required' });

  try {
    db.prepare('DELETE FROM drive_access WHERE item_id = ? AND user_id = ?').run(itemIdVal.value, userIdVal.value);
    res.json({ success: true });
  } catch (e) {
    console.error('Revoke permission error:', e);
    res.status(500).json({ error: 'Failed to revoke permission' });
  }
});

// Get Permissions
router.get('/permissions/:id', verifyToken, checkRole('admin'), (req, res) => {
  try {
    const permissions = db.prepare(`
      SELECT da.*, u.name as user_name, u.email as user_email, u.role as user_role 
      FROM drive_access da
      JOIN users u ON u.id = da.user_id
      WHERE da.item_id = ?
      ORDER BY u.name ASC
    `).all(req.params.id);
    res.json(permissions);
  } catch (e) {
    console.error('Permissions read error:', e);
    res.status(500).json({ error: 'Failed to load permissions' });
  }
});

// Download File
router.get('/download/:id', verifyToken, (req, res) => {
  try {
    const item = db.prepare("SELECT * FROM drive_items WHERE id = ? AND type = 'file'").get(req.params.id);
    if (!item) return res.status(404).json({ error: 'File not found' });

    if (!isAdmin(req.user) && !userCanAccessItem(req.user.id, item.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const filePath = path.join(DRIVE_ROOT, item.file_path);
    const realPath = fs.existsSync(filePath) ? fs.realpathSync(filePath) : null;
    const realRoot = fs.realpathSync(DRIVE_ROOT);
    if (!realPath || !realPath.startsWith(realRoot)) return res.status(404).json({ error: 'File not found' });
    
    res.download(filePath, item.name);
  } catch (e) {
    console.error('Download error:', e);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Preview metadata/content for supported file types
router.get('/preview-data/:id', verifyToken, async (req, res) => {
  try {
    const item = db.prepare("SELECT * FROM drive_items WHERE id = ? AND type = 'file'").get(req.params.id);
    if (!item) return res.status(404).json({ error: 'File not found' });

    if (!isAdmin(req.user) && !userCanAccessItem(req.user.id, item.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = path.join(DRIVE_ROOT, item.file_path);
    const realPath = fs.existsSync(filePath) ? fs.realpathSync(filePath) : null;
    const realRoot = fs.realpathSync(DRIVE_ROOT);
    if (!realPath || !realPath.startsWith(realRoot)) return res.status(404).json({ error: 'File not found' });

    const mimeType = String(item.mime_type || '').toLowerCase();
    const name = String(item.name || '');
    const ext = path.extname(name).toLowerCase();
    const textExtensions = new Set([
      '.txt', '.md', '.csv', '.json', '.log', '.xml', '.html', '.htm',
      '.css', '.js', '.ts', '.yaml', '.yml', '.ini', '.env'
    ]);

    if (mimeType.startsWith('image/')) {
      return res.json({ kind: 'image', previewUrl: `/api/drive/download/${item.id}` });
    }

    if (mimeType === 'application/pdf' || ext === '.pdf') {
      return res.json({ kind: 'pdf', previewUrl: `/api/drive/download/${item.id}` });
    }

    if (mimeType.startsWith('video/') || ['.mp4', '.webm', '.ogg', '.mov', '.m4v'].includes(ext)) {
      return res.json({ kind: 'video', previewUrl: `/api/drive/download/${item.id}` });
    }

    if (mimeType.includes('wordprocessingml.document') || ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return res.json({
        kind: 'text',
        format: 'docx',
        previewText: result.value || '',
        note: 'Extracted from Word document'
      });
    }

    if (
      textExtensions.has(ext) ||
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml' ||
      mimeType === 'application/javascript' ||
      mimeType === 'application/octet-stream'
    ) {
      const previewText = fs.readFileSync(filePath, 'utf8');
      return res.json({
        kind: 'text',
        format: ext.replace('.', '') || 'text',
        previewText,
        note: 'Text file preview'
      });
    }

    if (mimeType === 'application/msword' || ext === '.doc') {
      return res.json({
        kind: 'unsupported',
        note: 'Legacy .doc files are not previewable in-browser. Download to view.'
      });
    }

    return res.json({
      kind: 'unsupported',
      note: 'Preview is not available for this file type.'
    });
  } catch (e) {
    console.error('Preview data error:', e);
    res.status(500).json({ error: 'Failed to load preview' });
  }
});

// Delete Item - admins can delete anything; employees can delete folders/files they
// created, as long as nothing inside a folder belongs to someone else (deleting a folder
// removes everything beneath it).
router.delete('/:id', verifyToken, (req, res) => {
  try {
    const item = stmts.itemById.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // The item and (for folders) everything beneath it.
    const tree = db.prepare(`
      WITH RECURSIVE tree(id) AS (
        SELECT id FROM drive_items WHERE id = ?
        UNION ALL
        SELECT d.id FROM drive_items d JOIN tree t ON d.parent_id = t.id
      )
      SELECT id, type, file_path, created_by FROM drive_items WHERE id IN (SELECT id FROM tree)
    `).all(item.id);

    if (!isAdmin(req.user)) {
      if (Number(item.created_by) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'You can only delete folders and files you created' });
      }
      const othersCount = tree.filter(t => Number(t.created_by) !== Number(req.user.id)).length;
      if (othersCount > 0) {
        return res.status(403).json({ error: `This folder contains ${othersCount} item(s) added by other people. Ask an admin to delete it, or remove your own items individually.` });
      }
    }

    // Stored files to remove from disk after the rows are gone.
    const files = tree.filter(t => t.type === 'file' && t.file_path);

    // SQLite with foreign_keys=ON will handle children of a folder
    db.prepare('DELETE FROM drive_items WHERE id = ?').run(item.id);
    files.forEach(f => removeStoredFile(path.basename(f.file_path)));
    res.json({ success: true });
  } catch (e) {
    console.error('Delete drive item error:', e);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;
