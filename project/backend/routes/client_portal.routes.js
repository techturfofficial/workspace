const router = require('express').Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { comparePassword, hashPassword, verifyClientToken, requireClientScope, isStrongPassword } = require('../auth');
const { publish } = require('../services/realtime');


const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Rate limiter for client login: 5 attempts per 15 minutes per IP + ID combo
const clientLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `${req.ip}_${req.body.client_login_id || ''}`;
  }
});

// Helper to get or create conversation with client's Team Leader/Handler
// Adds ALL relevant staff (leader, admin, project members) as participants
// so the thread is visible in Employee Portal Team Messenger.
function getOrCreateClientConversation(clientId) {
  let conversation = db.prepare('SELECT id FROM conversations WHERE client_id = ? LIMIT 1').get(clientId);
  if (conversation) return conversation.id;

  let client = db.prepare('SELECT team_leader_id FROM clients WHERE id = ?').get(clientId);
  let leaderId = client?.team_leader_id;
  if (!leaderId) {
    const project = db.prepare('SELECT team_leader_id FROM projects WHERE client_id = ? AND team_leader_id IS NOT NULL LIMIT 1').get(clientId);
    leaderId = project?.team_leader_id;
  }
  if (!leaderId) {
    const fallback = db.prepare("SELECT id FROM users WHERE role = 'admin' OR role = 'client_handler' LIMIT 1").get();
    leaderId = fallback?.id;
  }

  if (!leaderId) throw new Error('No team leader or handler available to message');

  const result = db.prepare('INSERT INTO conversations (title, is_group, client_id) VALUES (?, 0, ?)')
    .run('Client Chat Thread', clientId);
  const conversationId = result.lastInsertRowid;

  // Collect all staff who should see this client thread
  const participantIds = new Set();
  participantIds.add(leaderId);

  // Add admin users so they always have visibility
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all();
  admins.forEach(a => participantIds.add(a.id));

  // Add project members assigned to this client's projects
  const projectMembers = db.prepare(`
    SELECT DISTINCT pm.user_id FROM project_members pm
    JOIN projects p ON p.id = pm.project_id
    WHERE p.client_id = ?
  `).all(clientId);
  projectMembers.forEach(m => participantIds.add(m.user_id));

  // Add project team leaders
  const projectLeaders = db.prepare(`
    SELECT DISTINCT team_leader_id FROM projects
    WHERE client_id = ? AND team_leader_id IS NOT NULL
  `).all(clientId);
  projectLeaders.forEach(l => participantIds.add(l.team_leader_id));

  const insertParticipant = db.prepare('INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)');
  for (const userId of participantIds) {
    insertParticipant.run(conversationId, userId);
  }

  return conversationId;
}

// POST /api/client-portal/login
router.post('/login', clientLoginLimiter, async (req, res) => {
  const { client_login_id, password } = req.body;
  if (!client_login_id || !password) {
    return res.status(400).json({ message: 'Client Login ID and password required' });
  }

  try {
    let client = db.prepare('SELECT * FROM clients WHERE client_login_id = ? AND is_active = 1').get(String(client_login_id).trim());

    if (!client) {
      return res.status(401).json({ message: 'No clients found in database or invalid login ID' });
    }

    const valid = client.password_hash && await comparePassword(password, client.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    db.prepare('UPDATE clients SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(client.id);

    const token = jwt.sign(
      { type: 'client', clientId: client.id, name: client.name, company: client.company },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      client: {
        id: client.id,
        name: client.name,
        company: client.company,
        email: client.email,
        client_login_id: client.client_login_id
      }
    });
  } catch (err) {
    console.error('Client login error:', err);
    res.status(500).json({ message: 'Server error during client login' });
  }
});

// POST /api/client-portal/change-password
router.post('/change-password', verifyClientToken, requireClientScope, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ message: 'New password required' });

  if (!isStrongPassword(password)) {
    return res.status(400).json({ message: 'Password must be at least 12 characters and include uppercase, lowercase, numbers, and symbols.' });
  }

  try {
    const hash = await hashPassword(password);
    db.prepare('UPDATE clients SET password_hash = ? WHERE id = ?').run(hash, req.clientScope.clientId);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ message: 'Failed to update password' });
  }
});

// GET /api/client-portal/home
router.get('/home', verifyClientToken, requireClientScope, (req, res) => {
  try {
    const projects = db.prepare('SELECT id, title, description, status, priority, progress_percent, deadline FROM projects WHERE client_id = ? AND status = ?').all(req.clientScope.clientId, 'active');
    const banners = db.prepare('SELECT id, title, image_url, link_url FROM client_portal_banners WHERE is_active = 1 ORDER BY created_at DESC LIMIT 5').all();
    res.json({
      client: {
        name: req.client.name,
        company: req.client.company
      },
      projects,
      banners
    });
  } catch (err) {
    console.error('Home data error:', err);
    res.status(500).json({ message: 'Failed to load home dashboard' });
  }
});

// GET /api/client-portal/workspace
router.get('/workspace', verifyClientToken, requireClientScope, (req, res) => {
  try {
    const projects = db.prepare('SELECT id, title, description, status, priority, progress_percent, deadline, team_leader_id FROM projects WHERE client_id = ?').all(req.clientScope.clientId);

    // Fetch team members mapped per project
    const projectIds = projects.map(p => p.id);
    let teamMembers = [];
    if (projectIds.length > 0) {
      const placeholders = projectIds.map(() => '?').join(',');
      // Fetch assigned members
      const members = db.prepare(`
        SELECT pm.project_id, u.name, u.role 
        FROM users u 
        JOIN project_members pm ON pm.user_id = u.id 
        WHERE pm.project_id IN (${placeholders})
      `).all(...projectIds);

      // Fetch team leaders
      const leaders = db.prepare(`
        SELECT p.id as project_id, u.name, u.role 
        FROM users u 
        JOIN projects p ON p.team_leader_id = u.id 
        WHERE p.id IN (${placeholders})
      `).all(...projectIds);

      teamMembers = [...members, ...leaders];
    }

    // Map team members to projects
    projects.forEach(p => {
      p.team = teamMembers
        .filter(m => m.project_id === p.id)
        .map(m => ({ name: m.name, role: m.role }));
      // Deduplicate team members
      const uniqueTeam = [];
      const seen = new Set();
      p.team.forEach(t => {
        const key = `${t.name}_${t.role}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueTeam.push(t);
        }
      });
      p.team = uniqueTeam;
    });

    // Fetch approved project deliverables/reports
    const reports = db.prepare(`
      SELECT s.id, s.task_id, s.file_path, s.content_text, s.external_link, s.created_at, 
             COALESCE(t.title, 'Project Milestone Report') as report_title,
             p.title as project_title, s.version
      FROM submissions s 
      LEFT JOIN tasks t ON t.id = s.task_id 
      LEFT JOIN projects p ON p.id = t.project_id 
      WHERE s.client_id = ? AND s.admin_status = 'approved'
      ORDER BY s.created_at DESC
    `).all(req.clientScope.clientId);

    res.json({ projects, reports });
  } catch (err) {
    console.error('Workspace data error:', err);
    res.status(500).json({ message: 'Failed to load workspace files' });
  }
});

// GET /api/client-portal/reviews & POST /api/client-portal/reviews
router.get('/reviews', verifyClientToken, requireClientScope, (req, res) => {
  try {
    const reviews = db.prepare(`
      SELECT cr.*, p.title as project_title 
      FROM client_reviews cr 
      JOIN projects p ON p.id = cr.project_id 
      WHERE cr.client_id = ? 
      ORDER BY cr.created_at DESC
    `).all(req.clientScope.clientId);
    res.json(reviews);
  } catch (err) {
    console.error('Get reviews error:', err);
    res.status(500).json({ message: 'Failed to load feedback history' });
  }
});

router.post('/reviews', verifyClientToken, requireClientScope, (req, res) => {
  const { project_id, rating, feedback_text } = req.body;
  if (!project_id || !rating) {
    return res.status(400).json({ message: 'Project ID and rating required' });
  }

  const ratingVal = parseInt(rating);
  if (isNaN(ratingVal) || ratingVal < 1 || ratingVal > 5) {
    return res.status(400).json({ message: 'Rating must be an integer between 1 and 5' });
  }

  try {
    // Assert project belongs to client — DB-layer scoping
    const project = db.prepare('SELECT id FROM projects WHERE id=? AND client_id=?').get(project_id, req.clientScope.clientId);
    if (!project) {
      return res.status(403).json({ message: 'Unauthorized project context' });
    }

    db.prepare('INSERT INTO client_reviews (project_id, client_id, rating, feedback_text) VALUES (?, ?, ?, ?)')
      .run(project_id, req.clientScope.clientId, ratingVal, feedback_text || '');

    // Recompute client's overall satisfaction score based on average rating
    const avgData = db.prepare('SELECT AVG(rating) as avg_rating FROM client_reviews WHERE client_id=?').get(req.clientScope.clientId);
    if (avgData && avgData.avg_rating !== null) {
      const satisfaction = Math.round(avgData.avg_rating * 20); // convert 1-5 to 0-100%
      db.prepare('UPDATE clients SET satisfaction_score = ? WHERE id = ?').run(satisfaction, req.clientScope.clientId);
    }

    res.json({ message: 'Review submitted successfully' });
  } catch (err) {
    console.error('Submit review error:', err);
    res.status(500).json({ message: 'Failed to record review' });
  }
});

// GET /api/client-portal/messages & POST /api/client-portal/messages
router.get('/messages', verifyClientToken, requireClientScope, (req, res) => {
  try {
    const conversationId = getOrCreateClientConversation(req.clientScope.clientId);
    const messages = db.prepare(`
      SELECT m.id, m.conversation_id, m.sender_id, m.sender_client_id, m.message, m.created_at,
             u.name as sender_name, u.role as sender_role 
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id=?
      ORDER BY m.created_at ASC, m.id ASC
    `).all(conversationId);
    res.json({ conversationId, messages });
  } catch (err) {
    console.error('Get messages error:', err.message);
    res.status(500).json({ message: 'Failed to retrieve messages' });
  }
});

router.post('/messages', verifyClientToken, requireClientScope, (req, res) => {
  const { message } = req.body;
  if (!message || !String(message).trim()) {
    return res.status(400).json({ message: 'Message body cannot be empty' });
  }

  try {
    const conversationId = getOrCreateClientConversation(req.clientScope.clientId);
    const result = db.prepare('INSERT INTO chat_messages (conversation_id, sender_client_id, message) VALUES (?, ?, ?)')
      .run(conversationId, req.clientScope.clientId, String(message).trim());

    db.prepare('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(conversationId);

    const sent = db.prepare('SELECT * FROM chat_messages WHERE id=?').get(result.lastInsertRowid);

    // Publish to real-time bus so Employee Portal messenger picks up the message immediately
    const participants = db.prepare('SELECT user_id FROM conversation_participants WHERE conversation_id=?').all(conversationId).map(p => p.user_id);
    const clientName = req.client ? req.client.name : 'Client';
    publish('chat.message', {
      conversationId: Number(conversationId),
      message: { ...sent, sender_name: clientName, sender_role: 'client' },
      participantIds: participants,
      source: 'client_portal',
      at: new Date().toISOString()
    });

    res.json({ message: 'Message sent', data: sent });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ message: 'Failed to dispatch message' });
  }
});

// GET /api/client-portal/meetings & POST /api/client-portal/meetings
router.get('/meetings', verifyClientToken, requireClientScope, (req, res) => {
  try {
    const meetings = db.prepare(`
      SELECT m.*, u.name as team_leader_name 
      FROM meetings m 
      LEFT JOIN users u ON u.id = m.team_leader_id 
      WHERE m.client_id = ? 
      ORDER BY m.scheduled_at DESC
    `).all(req.clientScope.clientId);
    res.json(meetings);
  } catch (err) {
    console.error('Get meetings error:', err);
    res.status(500).json({ message: 'Failed to retrieve scheduled meetings' });
  }
});

router.post('/meetings', verifyClientToken, requireClientScope, (req, res) => {
  const { title, description, scheduled_at } = req.body;
  if (!title || !scheduled_at) {
    return res.status(400).json({ message: 'Meeting title and date/time are required' });
  }

  try {
    // Find Team Leader to meet
    let client = db.prepare('SELECT team_leader_id FROM clients WHERE id = ?').get(req.clientScope.clientId);
    let leaderId = client?.team_leader_id;
    if (!leaderId) {
      const project = db.prepare('SELECT team_leader_id FROM projects WHERE client_id = ? AND team_leader_id IS NOT NULL LIMIT 1').get(req.clientScope.clientId);
      leaderId = project?.team_leader_id;
    }
    if (!leaderId) {
      const fallback = db.prepare("SELECT id FROM users WHERE role = 'admin' OR role = 'client_handler' LIMIT 1").get();
      leaderId = fallback?.id;
    }

    if (!leaderId) {
      return res.status(404).json({ message: 'No assigned leader found to schedule meeting with' });
    }

    db.prepare('INSERT INTO meetings (client_id, team_leader_id, title, description, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.clientScope.clientId, leaderId, title, description || '', scheduled_at, 'pending');

    res.json({ message: 'Meeting proposed successfully. Awaiting team lead confirmation.' });
  } catch (err) {
    console.error('Propose meeting error:', err);
    res.status(500).json({ message: 'Failed to propose meeting slot' });
  }
});

// GET /api/client-portal/payments
// Reads from the shared payments table, scoped to this client only.
// Strips internal-only fields: created_by, user_id (staff who logged it).
router.get('/payments', verifyClientToken, requireClientScope, (req, res) => {
  try {
    const contract = db.prepare('SELECT agreement, payment_terms, ownership, nda, budget, timeline, created_at FROM clients WHERE id = ?').get(req.clientScope.clientId);
    const paymentsList = db.prepare(`
      SELECT id, amount, currency, payment_date, method, status, description, notes, source, created_at
      FROM payments 
      WHERE client_id = ? 
      ORDER BY payment_date DESC, created_at DESC
    `).all(req.clientScope.clientId);
    res.json({ contract, payments: paymentsList });
  } catch (err) {
    console.error('Get payments error:', err);
    res.status(500).json({ message: 'Failed to retrieve billing statements' });
  }
});

// GET /api/client-portal/tickets & POST /api/client-portal/tickets
router.get('/tickets', verifyClientToken, requireClientScope, (req, res) => {
  try {
    const tickets = db.prepare(`
      SELECT t.id, t.title, t.description, t.status, t.priority, t.category, t.created_at, t.updated_at,
             u.name as assigned_name 
      FROM tickets t 
      LEFT JOIN users u ON u.id = t.assigned_to 
      WHERE t.client_id = ? 
      ORDER BY t.created_at DESC
    `).all(req.clientScope.clientId);
    res.json(tickets);
  } catch (err) {
    console.error('Get tickets error:', err);
    res.status(500).json({ message: 'Failed to load tickets ledger' });
  }
});

router.post('/tickets', verifyClientToken, requireClientScope, (req, res) => {
  const { title, description, priority, category } = req.body;
  if (!title) return res.status(400).json({ message: 'Ticket subject/title required' });

  try {
    db.prepare('INSERT INTO tickets (title, description, priority, category, client_id, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(title, description || '', priority || 'normal', category || 'General Support', req.clientScope.clientId, 'open');
    res.json({ message: 'Support ticket raised successfully' });
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(500).json({ message: 'Failed to log ticket' });
  }
});

module.exports = router;
