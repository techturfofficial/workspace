const router = require('express').Router();
const db = require('../db');
const { verifyToken } = require('../auth');

// List all payments (optionally filter by user or client)
router.get('/', verifyToken, (req, res) => {
  const { user_id, client_id } = req.query;
  let sql = `
    SELECT p.*, u.name as user_name, c.name as client_name, c.company as client_company,
      CASE
        WHEN p.status IS NOT NULL AND p.status != '' THEN p.status
        WHEN p.payment_date IS NOT NULL THEN 'recorded'
        ELSE 'pending'
      END as computed_status
    FROM payments p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE 1=1
  `;
  const params = [];
  if (user_id) { sql += ' AND p.user_id = ?'; params.push(user_id); }
  if (client_id) { sql += ' AND p.client_id = ?'; params.push(client_id); }
  sql += ' ORDER BY p.payment_date DESC, p.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Add a new payment
router.post('/', verifyToken, (req, res) => {
  const { user_id, client_id, amount, currency, payment_date, method, notes, status, description } = req.body;
  if (!amount) return res.status(400).json({ error: 'Amount required' });
  const created_by = req.user?.id || 1;
  const stmt = db.prepare(`
    INSERT INTO payments (user_id, client_id, amount, currency, payment_date, method, notes, status, description, source, created_by) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    user_id || null,
    client_id || null,
    amount,
    currency || 'INR',
    payment_date || null,
    method || '',
    notes || '',
    status || 'pending',
    description || '',
    'employee_portal',
    created_by
  );
  res.json({ id: info.lastInsertRowid });
});

// Get payments for a specific client (staff-facing)
router.get('/client/:clientId', verifyToken, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, u.name as user_name
    FROM payments p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.client_id = ?
    ORDER BY p.payment_date DESC, p.created_at DESC
  `).all(req.params.clientId);
  res.json(rows);
});

// Delete a payment
router.delete('/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM payments WHERE id=?').run(id);
  res.json({ success: true });
});

module.exports = router;
