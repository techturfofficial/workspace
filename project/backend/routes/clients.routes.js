const router = require('express').Router();
const db = require('../db');
const { verifyToken, checkRole } = require('../auth');
const { encryptPassword, decryptPassword, nextClientLoginId } = require('../services/portal-credentials');

// Never send portal credentials to the browser; only whether a password is set. Admins
// read the password through GET /:id/portal-password.
function withoutSecrets(client) {
  const { password_hash, portal_password, portal_password_enc, ...rest } = client;
  return { ...rest, has_portal_password: Boolean(password_hash) };
}

router.get('/', verifyToken, (req, res) => {
  const clients = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM projects WHERE client_id=c.id AND status='active') as active_projects
    FROM clients c ORDER BY c.name ASC
  `).all();
  res.json(clients.map(withoutSecrets));
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

  res.json({ ...withoutSecrets(c), projects, tasks, submissions });
});

router.post('/', verifyToken, checkRole('admin', 'client_handler', 'team_leader'), (req, res) => {
  const {
    name, company, client_login_id, phone, phone_alt, email, location, comm_method,
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
    // Access IDs are always assigned in sequence (TT-CLI-0001, ...), never typed in.
    const loginId = nextClientLoginId(db);
    const result = db.prepare(`INSERT INTO clients (
      name, company, client_login_id, phone, phone_alt, email, location, comm_method,
      industry, business_desc, audience, competitors, brand_assets,
      service_type, project_desc, project_goals, features, design_prefs, reference_examples,
      platform, tech, integrations, hosting,
      budget, timeline, urgency,
      content, media, guidelines, credentials,
      agreement, payment_terms, ownership, nda,
      maintenance, updates, marketing, team_leader_id, team_members,
      brand_colors, brand_tone, goals, project_key, stage
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      name, company, loginId, phone, phone_alt, email, location, comm_method,
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
    // client_login_id is not editable: Access IDs stay in their TT-CLI-#### sequence.
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
    // Detach/delete dependent rows first. Done explicitly (rather than relying on ON DELETE
    // rules) because older and newer databases were created with different FK rules.
    const cleanupAndDelete = db.transaction(() => {
      db.prepare('UPDATE projects SET client_id=NULL WHERE client_id=?').run(id);
      db.prepare('DELETE FROM portal_access WHERE client_id=?').run(id);
      db.prepare('DELETE FROM client_interactions WHERE client_id=?').run(id);
      db.prepare('DELETE FROM submissions WHERE client_id=?').run(id);
      db.prepare('DELETE FROM meetings WHERE client_id=?').run(id);
      db.prepare('DELETE FROM client_reviews WHERE client_id=?').run(id);
      db.prepare('UPDATE payments SET client_id=NULL WHERE client_id=?').run(id);
      db.prepare('UPDATE tickets SET client_id=NULL WHERE client_id=?').run(id);
      db.prepare('UPDATE team_inbox_threads SET client_id=NULL WHERE client_id=?').run(id);
      db.prepare('UPDATE meeting_notes SET client_id=NULL WHERE client_id=?').run(id);
      db.prepare('UPDATE chat_messages SET sender_client_id=NULL WHERE sender_client_id=?').run(id);
      // The client's chats go with the client (messages, reads and participants cascade).
      db.prepare('DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM conversations WHERE client_id=?)').run(id);
      db.prepare('DELETE FROM conversation_participants WHERE conversation_id IN (SELECT id FROM conversations WHERE client_id=?)').run(id);
      db.prepare('DELETE FROM conversations WHERE client_id=?').run(id);
      db.prepare('DELETE FROM clients WHERE id=?').run(id);
    });
    cleanupAndDelete();
    res.json({ message: 'Client deleted successfully' });
  } catch (err) {
    console.error('Failed to delete client:', err.message);
    res.status(500).json({ message: 'Failed to delete client' });
  }
});

// POST /api/clients/:id/provision-login (admin only): sets a new portal password
const crypto = require('crypto');
const { hashPassword } = require('../auth');
router.post('/:id/provision-login', verifyToken, checkRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const client = db.prepare('SELECT id, name, client_login_id FROM clients WHERE id=?').get(id);
    if (!client) return res.status(404).json({ message: 'Client not found' });

    // Keep the client's Access ID; only assign the next one in sequence if it's missing.
    const clientLoginId = client.client_login_id || nextClientLoginId(db);
    const tempPassword = 'TT-' + crypto.randomBytes(4).toString('hex').toUpperCase() + '$9z';
    const hash = await hashPassword(tempPassword);

    db.prepare('UPDATE clients SET client_login_id=?, password_hash=?, portal_password_enc=?, is_active=1 WHERE id=?')
      .run(clientLoginId, hash, encryptPassword(tempPassword), client.id);

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

// GET /api/clients/:id/portal-password (admin only): the client's current portal password.
// password is null when none is set, or it was set before passwords were stored viewable.
router.get('/:id/portal-password', verifyToken, checkRole('admin'), (req, res) => {
  const client = db.prepare('SELECT client_login_id, password_hash, portal_password_enc FROM clients WHERE id=?').get(req.params.id);
  if (!client) return res.status(404).json({ message: 'Client not found' });
  res.json({
    client_login_id: client.client_login_id,
    has_password: Boolean(client.password_hash),
    password: client.portal_password_enc ? decryptPassword(client.portal_password_enc) : null
  });
});

module.exports = router;
