const router = require('express').Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { comparePassword, hashPassword, verifyClientToken, requireClientScope, isStrongPassword } = require('../auth');
const { publish } = require('../services/realtime');
const { notifyUsers } = require('../services/notification.service');


const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Rate limiter for client login: 100 attempts per 15 minutes in dev / 20 in prod
const clientLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 100,
  skipSuccessfulRequests: true,
  message: { message: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `${req.ip}_${req.body.client_login_id || ''}`;
  }
});

// Get allowed staff user IDs for a given client (Admins + Assigned Project Leaders & Members)
function getAllowedStaffForClient(clientId, projectId = null) {
  const allowedUserIds = new Set();

  // 1. All active admins are allowed
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all();
  admins.forEach(a => allowedUserIds.add(a.id));

  // 2. Project-scoped staff
  if (projectId) {
    const proj = db.prepare("SELECT team_leader_id FROM projects WHERE id = ? AND client_id = ?").get(projectId, clientId);
    if (proj?.team_leader_id) allowedUserIds.add(proj.team_leader_id);

    const members = db.prepare(`
      SELECT pm.user_id FROM project_members pm
      JOIN projects p ON p.id = pm.project_id
      WHERE p.id = ? AND p.client_id = ?
    `).all(projectId, clientId);
    members.forEach(m => allowedUserIds.add(m.user_id));
  } else {
    const projLeaders = db.prepare("SELECT team_leader_id FROM projects WHERE client_id = ? AND team_leader_id IS NOT NULL").all(clientId);
    projLeaders.forEach(p => allowedUserIds.add(p.team_leader_id));

    const allMembers = db.prepare(`
      SELECT DISTINCT pm.user_id FROM project_members pm
      JOIN projects p ON p.id = pm.project_id
      WHERE p.client_id = ?
    `).all(clientId);
    allMembers.forEach(m => allowedUserIds.add(m.user_id));

    const clientRow = db.prepare("SELECT team_leader_id FROM clients WHERE id = ?").get(clientId);
    if (clientRow?.team_leader_id) allowedUserIds.add(clientRow.team_leader_id);
  }

  return allowedUserIds;
}

// Get or provision the Admin direct channel for this client
function getOrCreateAdminChannel(clientId) {
  let conv = db.prepare(`
    SELECT id FROM conversations 
    WHERE client_id = ? AND (project_id IS NULL OR project_id = 0) AND is_group = 0 
    LIMIT 1
  `).get(clientId);

  let convId;
  if (!conv) {
    const res = db.prepare(`
      INSERT INTO conversations (title, is_group, client_id, project_id) 
      VALUES ('Mission Control & Admin', 0, ?, NULL)
    `).run(clientId);
    convId = res.lastInsertRowid;
  } else {
    convId = conv.id;
  }

  // Ensure ONLY Admins are participants in the Admin Direct Channel
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all();
  
  // Clean up any non-admin participants
  db.prepare(`
    DELETE FROM conversation_participants 
    WHERE conversation_id = ? AND user_id NOT IN (SELECT id FROM users WHERE role = 'admin')
  `).run(convId);

  const ins = db.prepare("INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)");
  admins.forEach(a => ins.run(convId, a.id));

  return convId;
}

// Get or provision Project Group Channel for a specific project of this client
function getOrCreateProjectChannel(clientId, project) {
  let conv = db.prepare(`
    SELECT id FROM conversations 
    WHERE client_id = ? AND project_id = ? AND is_group = 1 
    LIMIT 1
  `).get(clientId, project.id);

  let convId;
  if (!conv) {
    const title = `${project.title} Squad`;
    const res = db.prepare(`
      INSERT INTO conversations (title, is_group, client_id, project_id) 
      VALUES (?, 1, ?, ?)
    `).run(title, clientId, project.id);
    convId = res.lastInsertRowid;
  } else {
    convId = conv.id;
  }

  // Synchronize participants strictly to: Admins + Project Leader + Project Members
  const allowedUserIds = getAllowedStaffForClient(clientId, project.id);

  if (allowedUserIds.size > 0) {
    const placeholders = Array.from(allowedUserIds).map(() => '?').join(',');
    db.prepare(`
      DELETE FROM conversation_participants 
      WHERE conversation_id = ? AND user_id NOT IN (${placeholders})
    `).run(convId, ...Array.from(allowedUserIds));
  }

  const ins = db.prepare("INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)");
  allowedUserIds.forEach(uid => ins.run(convId, uid));

  return convId;
}

// Get all authorized channels for a client
function getClientChannels(clientId) {
  const adminConvId = getOrCreateAdminChannel(clientId);
  
  const projects = db.prepare(`
    SELECT id, title, status FROM projects WHERE client_id = ?
  `).all(clientId);

  const seenConvIds = new Set([adminConvId]);
  const channels = [
    {
      id: adminConvId,
      title: 'Mission Control & Admin',
      type: 'admin',
      is_group: 0,
      badge: 'DIRECT ADMIN',
      description: 'Direct communication with Admin & Executive Management'
    }
  ];

  // 1. Ensure default project squad channels exist
  for (const p of projects) {
    const convId = getOrCreateProjectChannel(clientId, p);
    if (!seenConvIds.has(convId)) {
      seenConvIds.add(convId);
      channels.push({
        id: convId,
        title: `${p.title} Squad`,
        type: 'project_group',
        is_group: 1,
        project_id: p.id,
        project_title: p.title,
        project_status: p.status,
        badge: 'PROJECT SQUAD',
        description: `Collaborate directly with assigned engineers on ${p.title}`
      });
    }
  }

  // 2. Fetch all other custom squad / group conversations for this client
  const allClientGroups = db.prepare(`
    SELECT c.id, c.title, c.project_id, p.title as project_title
    FROM conversations c
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE c.client_id = ? AND c.is_group = 1
  `).all(clientId);

  for (const g of allClientGroups) {
    if (!seenConvIds.has(g.id)) {
      seenConvIds.add(g.id);
      channels.push({
        id: g.id,
        title: g.title || (g.project_title ? `${g.project_title} Squad` : 'Squad Group'),
        type: 'project_group',
        is_group: 1,
        project_id: g.project_id || null,
        project_title: g.project_title || null,
        badge: 'GROUP CHANNEL',
        description: g.project_title ? `Collaboration group for ${g.project_title}` : 'Dedicated squad discussion group'
      });
    }
  }

  // Attach participants and last message for each channel
  for (const ch of channels) {
    ch.participants = db.prepare(`
      SELECT u.id, u.name, u.role, u.avatar 
      FROM conversation_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = ?
      ORDER BY u.role = 'admin' DESC, u.name ASC
    `).all(ch.id);

    const lastMsg = db.prepare(`
      SELECT m.id, m.message, m.created_at, m.sender_client_id, u.name as sender_name, u.role as sender_role
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    `).get(ch.id);

    ch.last_message = lastMsg ? {
      text: lastMsg.message,
      time: lastMsg.created_at,
      sender: lastMsg.sender_client_id ? 'You' : (lastMsg.sender_name || 'Staff')
    } : null;
  }

  return channels;
}

// POST /api/client-portal/login
router.post('/login', clientLoginLimiter, async (req, res) => {
  const { client_login_id } = req.body;
  if (!client_login_id) {
    return res.status(400).json({ message: 'Client Access ID required' });
  }

  try {
    const queryStr = String(client_login_id).trim();
    const queryNum = isNaN(Number(queryStr)) ? -1 : Number(queryStr);

    let client = db.prepare(`
      SELECT * FROM clients 
      WHERE (
        LOWER(client_login_id) = LOWER(?)
        OR LOWER(email) = LOWER(?)
        OR LOWER(name) = LOWER(?)
        OR LOWER(company) = LOWER(?)
        OR id = ?
      ) AND (is_active = 1 OR is_active IS NULL)
      LIMIT 1
    `).get(queryStr, queryStr, queryStr, queryStr, queryNum);

    if (!client) {
      return res.status(401).json({ message: 'No client found matching this Client Access ID or Email' });
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

    // Real-time Staff Alert & Notification (Team Leader, Assigned Project Members & Admins)
    const client = db.prepare('SELECT name, company FROM clients WHERE id=?').get(req.clientScope.clientId);
    const proj = db.prepare('SELECT title, team_leader_id FROM projects WHERE id=?').get(project_id);
    const projectMembers = db.prepare('SELECT user_id FROM project_members WHERE project_id=?').all(project_id).map(m => m.user_id);
    const admins = db.prepare("SELECT id FROM users WHERE role='admin' AND is_active=1").all().map(u => u.id);
    const notifyStaffIds = [...new Set([...admins, proj?.team_leader_id, ...projectMembers].filter(Boolean))];

    const notifMsg = `🌟 New ${ratingVal}★ Client Review: "${client?.name || 'Client'}" reviewed "${proj?.title || 'Project'}" — "${feedback_text ? feedback_text.slice(0, 80) : 'Satisfaction rated'}"`;
    notifyUsers(notifyStaffIds, notifMsg, 'info', 'Tech Turf: New Client Review Submitted').catch(() => {});

    res.json({ message: 'Review submitted successfully' });
  } catch (err) {
    console.error('Submit review error:', err);
    res.status(500).json({ message: 'Failed to record review' });
  }
});

// GET /api/client-portal/channels
// Returns only authorized channels: Admin Direct Channel and Project Squad Groups for this client
router.get('/channels', verifyClientToken, requireClientScope, (req, res) => {
  try {
    const channels = getClientChannels(req.clientScope.clientId);
    res.json({ channels });
  } catch (err) {
    console.error('Get channels error:', err.message);
    res.status(500).json({ message: 'Failed to retrieve communication channels' });
  }
});

// POST /api/client-portal/groups
// Allows client to create a custom discussion squad group with authorized project members and admins
router.post('/groups', verifyClientToken, requireClientScope, (req, res) => {
  const { title, project_id, participant_ids } = req.body;
  const groupTitle = String(title || '').trim();
  if (!groupTitle) {
    return res.status(400).json({ message: 'Group title is required' });
  }

  const clientId = req.clientScope.clientId;
  const projectId = project_id ? Number(project_id) : null;

  try {
    // Validate project if provided
    if (projectId) {
      const proj = db.prepare('SELECT id FROM projects WHERE id=? AND client_id=?').get(projectId, clientId);
      if (!proj) {
        return res.status(403).json({ message: 'Selected project is not assigned to your account' });
      }
    }

    // Get allowed staff (only Admins + assigned project members)
    const allowedStaffIds = getAllowedStaffForClient(clientId, projectId);

    const validParticipants = new Set();
    // Always include active admins
    const admins = db.prepare("SELECT id FROM users WHERE role='admin' AND is_active=1").all();
    admins.forEach(a => validParticipants.add(a.id));

    // If project_id provided, include project leader
    if (projectId) {
      const proj = db.prepare("SELECT team_leader_id FROM projects WHERE id=?").get(projectId);
      if (proj?.team_leader_id) validParticipants.add(proj.team_leader_id);
    }

    // Add only requested participants who are verified as allowed
    if (Array.isArray(participant_ids)) {
      participant_ids.forEach(uid => {
        const numId = Number(uid);
        if (allowedStaffIds.has(numId)) {
          validParticipants.add(numId);
        }
      });
    }

    const result = db.prepare(`
      INSERT INTO conversations (title, is_group, client_id, project_id)
      VALUES (?, 1, ?, ?)
    `).run(groupTitle, clientId, projectId);

    const convId = result.lastInsertRowid;
    const insP = db.prepare('INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)');
    validParticipants.forEach(uid => insP.run(convId, uid));

    res.json({ message: 'Squad group created successfully', conversationId: convId });
  } catch (err) {
    console.error('Create client group error:', err);
    res.status(500).json({ message: 'Failed to create squad group' });
  }
});

// GET /api/client-portal/messages & POST /api/client-portal/messages
router.get('/messages', verifyClientToken, requireClientScope, (req, res) => {
  try {
    const channels = getClientChannels(req.clientScope.clientId);
    if (!channels || channels.length === 0) {
      return res.json({ conversationId: null, channel: null, messages: [], participants: [] });
    }

    const requestedId = req.query.conversation_id ? Number(req.query.conversation_id) : null;
    let targetChannel = requestedId ? channels.find(c => c.id === requestedId) : channels[0];

    if (!targetChannel) {
      return res.status(403).json({ message: 'Access denied: You are not authorized to view this channel' });
    }

    const messages = db.prepare(`
      SELECT m.id, m.conversation_id, m.sender_id, m.sender_client_id, m.message, m.created_at,
             u.name as sender_name, u.role as sender_role, u.avatar as sender_avatar
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC, m.id ASC
    `).all(targetChannel.id);

    res.json({
      conversationId: targetChannel.id,
      channel: targetChannel,
      channels,
      messages,
      participants: targetChannel.participants || []
    });
  } catch (err) {
    console.error('Get messages error:', err.message);
    res.status(500).json({ message: 'Failed to retrieve messages' });
  }
});

router.post('/messages', verifyClientToken, requireClientScope, (req, res) => {
  const { message, conversation_id } = req.body;
  if (!message || !String(message).trim()) {
    return res.status(400).json({ message: 'Message body cannot be empty' });
  }

  try {
    const channels = getClientChannels(req.clientScope.clientId);
    const requestedId = conversation_id ? Number(conversation_id) : (channels[0]?.id || null);
    const targetChannel = channels.find(c => c.id === requestedId);

    if (!targetChannel) {
      return res.status(403).json({ message: 'Access denied: You cannot send messages to this channel' });
    }

    const conversationId = targetChannel.id;
    const result = db.prepare('INSERT INTO chat_messages (conversation_id, sender_client_id, message) VALUES (?, ?, ?)')
      .run(conversationId, req.clientScope.clientId, String(message).trim());

    db.prepare('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(conversationId);

    const sent = db.prepare('SELECT * FROM chat_messages WHERE id=?').get(result.lastInsertRowid);

    // Publish to real-time bus so Employee Portal picks up the message immediately
    const participants = db.prepare('SELECT user_id FROM conversation_participants WHERE conversation_id=?').all(conversationId).map(p => p.user_id);
    const clientName = req.client ? req.client.name : 'Client';
    publish('chat.message', {
      conversationId: Number(conversationId),
      message: { ...sent, sender_name: clientName, sender_role: 'client' },
      participantIds: participants,
      source: 'client_portal',
      at: new Date().toISOString()
    });

    res.json({ message: 'Message sent', data: sent, conversationId });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ message: 'Failed to dispatch message' });
  }
});

// GET /api/client-portal/meetings & POST /api/client-portal/meetings
router.get('/meetings', verifyClientToken, requireClientScope, (req, res) => {
  try {
    const meetings = db.prepare(`
      SELECT m.*, u.name as team_leader_name, u.role as team_leader_role
      FROM meetings m 
      LEFT JOIN users u ON u.id = m.team_leader_id 
      WHERE m.client_id = ? 
      ORDER BY m.scheduled_at DESC
    `).all(req.clientScope.clientId);

    // Provide allowed hosts (Only Admins + Assigned Project Team Leaders)
    const allowedStaffIds = Array.from(getAllowedStaffForClient(req.clientScope.clientId));
    let allowedHosts = [];
    if (allowedStaffIds.length > 0) {
      const placeholders = allowedStaffIds.map(() => '?').join(',');
      allowedHosts = db.prepare(`
        SELECT id, name, role FROM users 
        WHERE id IN (${placeholders}) AND is_active = 1
        ORDER BY role = 'admin' DESC, name ASC
      `).all(...allowedStaffIds);
    }

    meetings.forEach(m => {
      let desc = m.description || '';
      let meetingLink = null;
      let hostNotes = null;

      const linkMatch = desc.match(/\[Video Sync Link\]:\s*([^\n\r]+)/i);
      if (linkMatch) {
        meetingLink = linkMatch[1].trim();
        desc = desc.replace(/\[Video Sync Link\]:\s*[^\n\r]+/i, '').trim();
      }

      const notesMatch = desc.match(/\[Staff Note\]:\s*([^\n\r]+)/i);
      if (notesMatch) {
        hostNotes = notesMatch[1].trim();
        desc = desc.replace(/\[Staff Note\]:\s*[^\n\r]+/i, '').trim();
      }

      // Also support standalone URLs in description
      if (!meetingLink) {
        const urlMatch = desc.match(/(https?:\/\/[^\s]+(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com)[^\s]*)/i);
        if (urlMatch) meetingLink = urlMatch[1].trim();
      }

      m.meeting_link = meetingLink;
      m.host_notes = hostNotes;
      m.clean_description = desc;
    });

    res.json({ meetings, allowed_hosts: allowedHosts });
  } catch (err) {
    console.error('Get meetings error:', err);
    res.status(500).json({ message: 'Failed to retrieve scheduled meetings' });
  }
});

router.post('/meetings', verifyClientToken, requireClientScope, (req, res) => {
  const { title, description, scheduled_at, team_leader_id } = req.body;
  if (!title || !scheduled_at) {
    return res.status(400).json({ message: 'Meeting title and date/time are required' });
  }

  try {
    const allowedStaffIds = getAllowedStaffForClient(req.clientScope.clientId);
    let leaderId = team_leader_id ? Number(team_leader_id) : null;

    if (leaderId && !allowedStaffIds.has(leaderId)) {
      return res.status(403).json({ message: 'Selected host is not an assigned leader or admin for your projects' });
    }

    if (!leaderId) {
      // Default to first allowed leader / admin
      leaderId = Array.from(allowedStaffIds)[0];
    }

    if (!leaderId) {
      return res.status(404).json({ message: 'No assigned leader or admin found to schedule meeting with' });
    }

    db.prepare('INSERT INTO meetings (client_id, team_leader_id, title, description, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.clientScope.clientId, leaderId, title, description || '', scheduled_at, 'pending');

    // Notify Host & Admins
    const client = db.prepare('SELECT name, company FROM clients WHERE id=?').get(req.clientScope.clientId);
    const admins = db.prepare("SELECT id FROM users WHERE role='admin' AND is_active=1").all().map(u => u.id);
    const notifyStaffIds = [...new Set([...admins, leaderId].filter(Boolean))];

    const notifMsg = `📅 Client Sync Proposed: "${client?.name || 'Client'}" requested a meeting "${title}" at ${scheduled_at}`;
    notifyUsers(notifyStaffIds, notifMsg, 'info', 'Tech Turf: Strategic Sync Proposed by Client').catch(() => {});

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
