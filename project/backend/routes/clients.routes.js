const router = require('express').Router();
const db = require('../db');
const { verifyToken, checkRole } = require('../auth');

router.get('/', verifyToken, (req, res) => {
  const clients = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM projects WHERE client_id=c.id AND status='active') as active_projects
    FROM clients c ORDER BY c.name ASC
  `).all();
  res.json(clients);
});

router.get('/:id', verifyToken, (req, res) => {
  const c = db.prepare(`
    SELECT c.*, u.name as team_leader_name 
    FROM clients c 
    LEFT JOIN users u ON u.id = c.team_leader_id 
    WHERE c.id=?
  `).get(req.params.id);
  if (!c) return res.status(404).json({ message: 'Not found' });

  const projects = db.prepare('SELECT * FROM projects WHERE client_id=? ORDER BY created_at DESC').all(req.params.id);

  const tasks = db.prepare(`
    SELECT t.*, p.title as project_title 
    FROM tasks t 
    JOIN projects p ON p.id = t.project_id 
    WHERE p.client_id=? 
    ORDER BY t.created_at DESC
  `).all(req.params.id);

  const submissions = db.prepare(`
    SELECT s.*, p.title as project_title, u.name as user_name 
    FROM submissions s 
    LEFT JOIN projects p ON p.id = (SELECT project_id FROM tasks WHERE id=s.task_id)
    LEFT JOIN users u ON u.id = s.submitted_by
    WHERE s.client_id=?
    ORDER BY s.created_at DESC
  `).all(req.params.id);

  res.json({ ...c, projects, tasks, submissions });
});

router.post('/', verifyToken, checkRole('admin', 'client_handler', 'team_leader'), (req, res) => {
  const {
    name, company, phone, phone_alt, email, location, comm_method,
    industry, business_desc, audience, competitors, brand_assets,
    service_type, project_desc, project_goals, features, design_prefs, reference_examples,
    platform, tech, integrations, hosting,
    budget, timeline, urgency,
    content, media, guidelines, credentials,
    agreement, payment_terms, ownership, nda,
    maintenance, updates, marketing, team_leader_id, team_members,
    brand_colors, brand_tone, goals, project_key, stage
  } = req.body;
  if (!name) return res.status(400).json({ message: 'Name required' });
  try {
    const result = db.prepare(`INSERT INTO clients (
      name, company, phone, phone_alt, email, location, comm_method,
      industry, business_desc, audience, competitors, brand_assets,
      service_type, project_desc, project_goals, features, design_prefs, reference_examples,
      platform, tech, integrations, hosting,
      budget, timeline, urgency,
      content, media, guidelines, credentials,
      agreement, payment_terms, ownership, nda,
      maintenance, updates, marketing, team_leader_id, team_members,
      brand_colors, brand_tone, goals, project_key, stage
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      name, company, phone, phone_alt, email, location, comm_method,
      industry, business_desc, audience, competitors, brand_assets,
      service_type, project_desc, project_goals, features, design_prefs, reference_examples || '',
      platform, tech, integrations, hosting,
      budget, timeline, urgency,
      content, media, guidelines, credentials,
      agreement, payment_terms, ownership, nda,
      maintenance, updates, marketing,
      team_leader_id || null, team_members || '',
      brand_colors, brand_tone, goals, project_key,
      stage || 'new_register'
    );
    res.json({ message: 'Client created', id: result.lastInsertRowid });
  } catch (err) {
    console.error('Create Client Error:', err);
    res.status(500).json({ message: 'Failed to create client: ' + err.message });
  }
});

router.put('/:id', verifyToken, checkRole('admin', 'client_handler', 'team_leader'), (req, res) => {
  const fields = [
    'name', 'company', 'phone', 'phone_alt', 'email', 'location', 'comm_method',
    'industry', 'business_desc', 'audience', 'competitors', 'brand_assets',
    'service_type', 'project_desc', 'project_goals', 'features', 'design_prefs', 'reference_examples',
    'platform', 'tech', 'integrations', 'hosting',
    'budget', 'timeline', 'urgency',
    'content', 'media', 'guidelines', 'credentials',
    'agreement', 'payment_terms', 'ownership', 'nda',
    'maintenance', 'updates', 'marketing',
    'brand_colors', 'brand_tone', 'goals', 'retainer_mode', 'team_leader_id', 'team_members', 'project_key', 'stage'
  ];

  try {
    const updates = [];
    const values = [];

    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(req.body[f]);
      }
    });

    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });

    values.push(req.params.id);
    const sql = `UPDATE clients SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...values);

    res.json({ message: 'Client updated successfully' });
  } catch (err) {
    console.error('Update Client Error:', err);
    res.status(500).json({ message: 'Failed to update client' });
  }
});

router.post('/:id/feedback', verifyToken, (req, res) => {
  const { score } = req.body; // 1-5
  if (!score || score < 1 || score > 5) return res.status(400).json({ message: 'Score must be 1-5' });
  db.prepare('UPDATE clients SET satisfaction_score=? WHERE id=?').run(score, req.params.id);
  res.json({ message: 'Feedback recorded' });
});

router.delete('/:id', verifyToken, checkRole('admin'), (req, res) => {
  try {
    const id = req.params.id;
    // Detach/delete dependent rows first to satisfy SQLite FK constraints.
    const cleanupAndDelete = db.transaction(() => {
      db.prepare('UPDATE projects SET client_id=NULL WHERE client_id=?').run(id);
      db.prepare('DELETE FROM portal_access WHERE client_id=?').run(id);
      db.prepare('DELETE FROM client_interactions WHERE client_id=?').run(id);
      db.prepare('DELETE FROM submissions WHERE client_id=?').run(id);
      db.prepare('DELETE FROM clients WHERE id=?').run(id);
    });
    cleanupAndDelete();
    res.json({ message: 'Client deleted successfully' });
  } catch (err) {
    console.error('Failed to delete client:', err.message);
    res.status(500).json({ message: 'Failed to delete client' });
  }
});

// POST /api/clients/:id/provision-login (staff only)
const crypto = require('crypto');
const { hashPassword } = require('../auth');
router.post('/:id/provision-login', verifyToken, checkRole('admin', 'client_handler'), async (req, res) => {
  const { id } = req.params;
  try {
    const client = db.prepare('SELECT id, name FROM clients WHERE id=?').get(id);
    if (!client) return res.status(404).json({ message: 'Client not found' });

    const clientLoginId = 'TT-CLI-' + String(client.id).padStart(5, '0');
    const tempPassword = 'TT-' + crypto.randomBytes(4).toString('hex').toUpperCase() + '$9z';
    const hash = await hashPassword(tempPassword);

    db.prepare('UPDATE clients SET client_login_id=?, password_hash=?, is_active=1 WHERE id=?')
      .run(clientLoginId, hash, client.id);

    res.json({
      message: 'Client portal login provisioned successfully',
      client_login_id: clientLoginId,
      temp_password: tempPassword
    });
  } catch (err) {
    console.error('Provision login error:', err);
    res.status(500).json({ message: 'Failed to provision client login: ' + err.message });
  }
});

module.exports = router;
