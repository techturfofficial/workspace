const router = require('express').Router();
const path = require('path');
const fs = require('fs');
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
    const safeName = sanitizeFilename(path.basename(file.originalname || 'upload.bin'));
    if (!safeName || safeName.includes('..')) return cb(new Error('Invalid filename'));
    cb(null, Date.now() + '_' + safeName);
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

const isAdmin = (user) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const secondary = (user.secondary_roles || '').split(',').map(r => r.trim());
  return secondary.includes('admin');
};

const userCanAccessItem = (userId, itemId) => {
  return !!db.prepare(`
    SELECT 1
    FROM drive_items di
    LEFT JOIN drive_access da ON da.item_id = di.id
    WHERE di.id = ?
      AND (
        di.created_by = ?
        OR da.user_id = ?
        OR EXISTS (
          WITH RECURSIVE parents(id, parent_id) AS (
            SELECT id, parent_id FROM drive_items WHERE id = di.id
            UNION ALL
            SELECT d.id, d.parent_id FROM drive_items d
            JOIN parents ON d.id = parents.parent_id
          )
          SELECT 1
          FROM parents p
          JOIN drive_access da2 ON da2.item_id = p.id
          WHERE da2.user_id = ?
        )
      )
    LIMIT 1
  `).get(itemId, userId, userId, userId);
};

// List items with access control
router.get('/items', verifyToken, (req, res) => {
  const pId = req.query.parentId;
  const parentId = (pId && pId !== 'null' && pId !== 'undefined') ? pId : null;
  const query = 'SELECT * FROM drive_items WHERE (parent_id = ? OR (? IS NULL AND parent_id IS NULL)) ORDER BY type DESC, name ASC';
  const params = [parentId, parentId];
  
  try {
    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create Folder - Only admin and team_leader can create folders
router.post('/folder', verifyToken, (req, res) => {
  const { name, parentId: pId } = req.body;
  const parentId = (pId && pId !== 'null' && pId !== 'undefined') ? pId : null;

  const nameVal = validateString(name, 'Folder name', { minLength: 1, maxLength: 120 });
  if (!nameVal.valid) return res.status(400).json({ error: nameVal.error });
  
  // Check if user is admin or team_leader
  const isTeamLeader = req.user.role === 'team_leader';
  const isAuthorized = isAdmin(req.user) || isTeamLeader;
  if (!isAuthorized) return res.status(403).json({ error: 'Only admins and team leaders can create folders' });

  try {
    const result = db.prepare('INSERT INTO drive_items (name, type, parent_id, created_by) VALUES (?, ?, ?, ?)').run(
      nameVal.value, 'folder', parentId, req.user.id
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    console.error('Create folder error:', e);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Upload File - Only admin and team_leader can upload files
router.post('/upload', verifyToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  const { parentId: pId } = req.body;
  const parentId = (pId && pId !== 'null' && pId !== 'undefined') ? pId : null;

  // Check if user is admin or team_leader
  const isTeamLeader = req.user.role === 'team_leader';
  const isAuthorized = isAdmin(req.user) || isTeamLeader;
  if (!isAuthorized) return res.status(403).json({ error: 'Only admins and team leaders can upload files' });

  try {
    const result = db.prepare('INSERT INTO drive_items (name, type, parent_id, mime_type, file_size, file_path, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      req.file.originalname,
      'file',
      parentId,
      req.file.mimetype,
      req.file.size,
      req.file.filename,
      req.user.id
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    console.error('Upload error:', e);
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

// Delete Item
router.delete('/:id', verifyToken, checkRole('admin'), (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM drive_items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    if (item.type === 'file') {
      const filePath = path.join(DRIVE_ROOT, item.file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    
    // SQLite with foreign_keys=ON will handle children of a folder
    db.prepare('DELETE FROM drive_items WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error('Delete drive item error:', e);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;
