const router = require('express').Router();
const db = require('../db');
const { verifyToken, checkRole } = require('../auth');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const publicPortalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: { message: 'Too many attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

function normalizePortalToken(raw) {
  const token = String(raw || '').trim();
  if (!token) return null;
  if (token.length < 6 || token.length > 128) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(token)) return null;
  return token;
}

// Staff endpoints are limited to the roles that run Client Connect: the pass list includes
// full portal tokens, which open that client's portal view.
const clientConnectStaff = checkRole('admin', 'client_handler');

// --- SUMMARY ---
router.get('/summary', verifyToken, clientConnectStaff, (req, res) => {
  const activeClients = db.prepare('SELECT COUNT(*) as count FROM clients').get().count;
  const activePasses = db.prepare('SELECT COUNT(*) as count FROM portal_access WHERE expires_at > ?').get(new Date().toISOString()).count;
  const recentTalks = db.prepare("SELECT COUNT(*) as count FROM client_interactions WHERE created_at > date('now', '-7 days')").get().count;
  res.json({ activeClients, activePasses, recentTalks });
});

// --- PORTAL PASS ---
router.post('/portal-pass', verifyToken, checkRole('admin', 'client_handler'), (req, res) => {
  const { client_id, hours } = req.body;
  if (!client_id) return res.status(400).json({ message: 'Client ID required' });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (parseInt(hours) || 24));

  db.prepare('INSERT INTO portal_access (client_id, token, expires_at) VALUES (?,?,?)')
    .run(client_id, token, expiresAt.toISOString());

  const link = `${req.protocol}://${req.get('host')}/client-portal.html?pass=${token}`;
  res.json({ token, expiresAt: expiresAt.toISOString(), passLink: link });
});

// --- PORTAL VERIFICATION (Public) ---
router.post('/verify-pass', publicPortalLimiter, (req, res) => {
  const token = normalizePortalToken(req.body?.token);
  if (!token) return res.status(400).json({ message: 'Token required' });

  let pass = db.prepare('SELECT * FROM portal_access WHERE token=? AND expires_at > ?')
    .get(token, new Date().toISOString());

  let client;
  if (pass) {
    client = db.prepare('SELECT id, name, company FROM clients WHERE id=?').get(pass.client_id);
  } else {
    // Check if it's a manual Project Key
    client = db.prepare('SELECT id, name, company FROM clients WHERE project_key=? COLLATE NOCASE').get(token.trim());
    if (client) {
      pass = { client_id: client.id, token: token, expires_at: 'PERMANENT' };
    }
  }

  if (!client) {
    return res.status(401).json({ message: 'Invalid or expired portal pass' });
  }

  res.json({ valid: true, client, pass_info: pass });
});

router.get('/portal-data', publicPortalLimiter, (req, res) => {
  try {
    const token = normalizePortalToken(req.query?.token);
    if (!token) return res.status(400).json({ message: 'Token required' });

    let pass = db.prepare('SELECT * FROM portal_access WHERE token=? AND expires_at > ?')
      .get(token, new Date().toISOString());

    let client;
    let clientId;
    if (!pass) {
      client = db.prepare('SELECT id, name, company, satisfaction_score FROM clients WHERE project_key=? COLLATE NOCASE').get(token.trim());
      if (!client) {
        return res.status(401).json({ message: 'Invalid or expired portal pass' });
      }
      clientId = client.id;
    } else {
      clientId = pass.client_id;
      client = db.prepare('SELECT id, name, company, satisfaction_score FROM clients WHERE id=?').get(clientId);
    }

    const projects = db.prepare('SELECT id, title, status, description, created_at FROM projects WHERE client_id=? ORDER BY created_at DESC').all(clientId);
    const tasks = db.prepare('SELECT t.*, p.title as project_title FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.client_id=? ORDER BY t.created_at DESC').all(clientId);
    const submissions = db.prepare(`
      SELECT s.id, s.version, s.leader_status as status, s.created_at, 
      COALESCE(p.title, s.project_name) as project_title
      FROM submissions s 
      LEFT JOIN tasks t ON t.id=s.task_id
      LEFT JOIN projects p ON p.id=t.project_id
      WHERE s.client_id=? 
      ORDER BY s.created_at DESC
    `).all(clientId);
    // Call logs are internal (free-text notes, sentiment, who logged it): the client only
    // gets when the team was last in touch and how.
    const last_interaction = db.prepare('SELECT type, created_at FROM client_interactions WHERE client_id=? ORDER BY created_at DESC LIMIT 1').get(clientId);

    res.json({ client, projects, tasks, submissions, last_interaction });
  } catch (err) {
    console.error('Portal data error:', err);
    res.status(500).json({ error: 'Failed to load portal data' });
  }
});

router.get('/passes/:clientId', verifyToken, clientConnectStaff, (req, res) => {
  const passes = db.prepare('SELECT * FROM portal_access WHERE client_id=? ORDER BY created_at DESC').all(req.params.clientId);
  res.json(passes);
});

// --- INTERACTIONS ---
router.post('/interactions', verifyToken, checkRole('admin', 'client_handler'), (req, res) => {
  const { client_id, type, notes, sentiment } = req.body;
  db.prepare('INSERT INTO client_interactions (client_id, handler_id, type, notes, sentiment) VALUES (?,?,?,?,?)')
    .run(client_id, req.user.id, type, notes, sentiment || 'Neutral');
  res.json({ message: 'Interaction logged' });
});

router.get('/interactions/:clientId', verifyToken, clientConnectStaff, (req, res) => {
  const rows = db.prepare('SELECT ci.*, u.name as handler_name FROM client_interactions ci LEFT JOIN users u ON ci.handler_id = u.id WHERE ci.client_id=? ORDER BY ci.created_at DESC').all(req.params.clientId);
  res.json(rows);
});

// --- NEXUS PULSE ---
router.post('/nexus-pulse', verifyToken, checkRole('admin', 'client_handler'), (req, res) => {
  const { client_id } = req.body;

  // Calculate a score based on real data (e.g. number of interactions, project status)
  const interactions = db.prepare('SELECT sentiment FROM client_interactions WHERE client_id=?').all(client_id);
  const posCount = interactions.filter(i => i.sentiment === 'Positive').length;
  const negCount = interactions.filter(i => i.sentiment === 'Negative').length;

  let baseScore = 75 + (posCount * 5) - (negCount * 10);
  baseScore = Math.min(100, Math.max(0, baseScore));

  const primarySentiment = baseScore > 85 ? 'Highly Satisfied' : baseScore > 65 ? 'Stable' : baseScore > 40 ? 'Needs Attention' : 'Critical Concern';

  res.json({
    client_id,
    primarySentiment,
    satisfactionScore: baseScore,
    recommendation: baseScore > 75 ? 'Continue current delivery cycle.' : (baseScore > 50 ? 'Suggest a monthly sync.' : 'Initiate immediate executive sync.')
  });
});

module.exports = router;
