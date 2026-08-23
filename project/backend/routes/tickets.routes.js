const router = require('express').Router();
const db = require('../db');
const { verifyToken } = require('../auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ticketsUploadDir = path.join(__dirname, '../../storage/uploads/tickets');
if (!fs.existsSync(ticketsUploadDir)) fs.mkdirSync(ticketsUploadDir, { recursive: true });

const ticketStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ticketsUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext) ? ext : '.png';
    cb(null, `ticket_${Date.now()}_${Math.round(Math.random() * 1E6)}${safeExt}`);
  }
});

const ticketUpload = multer({
  storage: ticketStorage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// List all tickets (admin: all, user: own)
router.get('/', verifyToken, (req, res) => {
  const { status, mine } = req.query;
  let sql = 'SELECT t.*, u.name as creator_name, a.name as assigned_name FROM tickets t LEFT JOIN users u ON t.created_by = u.id LEFT JOIN users a ON t.assigned_to = a.id WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  if (mine && req.user) { sql += ' AND t.created_by = ?'; params.push(req.user.id); }
  sql += ' ORDER BY t.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Add a new ticket
router.post('/', verifyToken, ticketUpload.single('image'), (req, res) => {
  const { title, description, priority, category } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const created_by = req.user?.id || 1;
  const image = req.file ? `/uploads/tickets/${req.file.filename}` : (req.body.image || null);
  const stmt = db.prepare('INSERT INTO tickets (title, description, priority, category, image, created_by) VALUES (?, ?, ?, ?, ?, ?)');
  const info = stmt.run(title, description || '', priority || 'normal', category || '', image, created_by);
  res.json({ id: info.lastInsertRowid, image });
});

// Update ticket status/assignment
router.put('/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  const { status, assigned_to } = req.body;
  let sql = "UPDATE tickets SET updated_at=datetime('now')";
  const params = [];
  if (status) { sql += ', status=?'; params.push(status); }
  if (assigned_to) { sql += ', assigned_to=?'; params.push(assigned_to); }
  sql += ' WHERE id=?';
  params.push(id);
  db.prepare(sql).run(...params);
  res.json({ success: true });
});

// Delete a ticket
router.delete('/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM tickets WHERE id=?').run(id);
  res.json({ success: true });
});

module.exports = router;
