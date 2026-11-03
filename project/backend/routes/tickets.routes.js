const router = require('express').Router();
const db = require('../db');
const { verifyToken, userHasRole } = require('../auth');
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
  const isAdmin = req.user && (req.user.role === 'admin' || (req.user.secondary_roles || '').split(',').includes('admin'));
  
  let sql = 'SELECT t.*, u.name as creator_name, a.name as assigned_name FROM tickets t LEFT JOIN users u ON t.created_by = u.id LEFT JOIN users a ON t.assigned_to = a.id WHERE 1=1';
  const params = [];

  if (!isAdmin || mine) {
    sql += ' AND t.created_by = ?';
    params.push(req.user?.id || 0);
  }

  if (status) { sql += ' AND t.status = ?'; params.push(status); }
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
  const ticket = db.prepare('SELECT id, created_by, assigned_to FROM tickets WHERE id=?').get(id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  // Only admins (or the person the ticket is assigned to) may change status/assignment.
  const isAdmin = userHasRole(req.user, 'admin');
  if (!isAdmin && Number(ticket.assigned_to) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'Only an admin or the assigned person can update this ticket' });
  }
  if (assigned_to && !isAdmin) {
    return res.status(403).json({ error: 'Only an admin can reassign tickets' });
  }
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
  const ticket = db.prepare('SELECT id, created_by FROM tickets WHERE id=?').get(id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  if (!userHasRole(req.user, 'admin') && Number(ticket.created_by) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'You can only delete your own tickets' });
  }
  db.prepare('DELETE FROM tickets WHERE id=?').run(id);
  res.json({ success: true });
});

module.exports = router;
