const router = require('express').Router();
const db = require('../db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { verifyToken } = require('../auth');
const { publish, subscribe } = require('../services/realtime');
const { notifyUsers } = require('../services/notification.service');

const chatUploadDir = path.join(__dirname, '../../uploads/chat');
if (!fs.existsSync(chatUploadDir)) fs.mkdirSync(chatUploadDir, { recursive: true });

const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, chatUploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeBase = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').toLowerCase();
      cb(null, `chat_${Date.now()}_u${req.user.id}_${safeBase}${ext}`);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 }
});

function normalizeIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0))];
}

function loadConversation(conversationId) {
  const conversation = db.prepare('SELECT * FROM conversations WHERE id=?').get(conversationId);
  if (!conversation) return null;

  conversation.participants = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.avatar
    FROM conversation_participants cp
    JOIN users u ON u.id = cp.user_id
    WHERE cp.conversation_id=?
    ORDER BY u.name ASC
  `).all(conversationId);

  return conversation;
}

function assertParticipant(conversationId, userId) {
  return db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=?').get(conversationId, userId);
}

function notifyParticipants(conversationId, senderId, message) {
  const participants = db.prepare('SELECT user_id FROM conversation_participants WHERE conversation_id=? AND user_id != ?').all(conversationId, senderId).map(p => p.user_id);
  notifyUsers(participants, message, 'info', 'Tech Turf New Chat Message').catch(() => {});
}

// SSE stream — supports token via query param since EventSource can't send headers
router.get('/stream', (req, res) => {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET;

  // Try Authorization header first, then fall back to query param
  let tokenStr = null;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    tokenStr = header.split(' ')[1];
  }
  if (!tokenStr && req.query.token) {
    tokenStr = String(req.query.token).trim();
  }
  if (!tokenStr) {
    return res.status(401).json({ message: 'No token provided' });
  }

  let userId;
  try {
    const decoded = jwt.verify(tokenStr, JWT_SECRET);
    if (decoded.type === 'client') {
      return res.status(403).json({ message: 'Forbidden — client token not allowed on staff routes' });
    }
    const dbUser = db.prepare('SELECT id, name, email, role, is_active FROM users WHERE id=?').get(decoded.id);
    if (!dbUser || Number(dbUser.is_active) !== 1) {
      return res.status(401).json({ message: 'Account inactive or not found' });
    }
    userId = Number(dbUser.id);
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onMessage = (payload) => {
    if (!payload || !Array.isArray(payload.participantIds)) return;
    if (!payload.participantIds.includes(userId)) return;
    res.write(`event: message\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const onTyping = (payload) => {
    if (!payload || !Array.isArray(payload.participantIds)) return;
    if (!payload.participantIds.includes(userId)) return;
    res.write(`event: typing\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const unsubMessage = subscribe('chat.message', onMessage);
  const unsubTyping = subscribe('chat.typing', onTyping);

  const heartbeat = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: {"ok":true}\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubMessage();
    unsubTyping();
    res.end();
  });
});

router.get('/users', verifyToken, (req, res) => {
  const users = db.prepare(`
    SELECT id, name, email, role, secondary_roles, avatar
    FROM users
    WHERE is_active=1 AND id != ?
    ORDER BY name ASC
  `).all(req.user.id);
  res.json(users);
});

router.get('/teams', verifyToken, (req, res) => {
  const teams = db.prepare(`
    SELECT t.*, u.name as leader_name,
      (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id=t.id) as member_count
    FROM teams t
    LEFT JOIN users u ON u.id = t.leader_id
    ORDER BY t.name ASC
  `).all();
  res.json(teams);
});

router.get('/conversations', verifyToken, (req, res) => {
  const conversations = db.prepare(`
    SELECT c.*,
      cl.name as client_name,
      cl.company as client_company,
      (
        SELECT message
        FROM chat_messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      ) as last_message,
      (
        SELECT m.created_at
        FROM chat_messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      ) as last_message_at,
      (
        SELECT GROUP_CONCAT(u.name, ', ')
        FROM conversation_participants cp
        JOIN users u ON u.id = cp.user_id
        WHERE cp.conversation_id = c.id
      ) as participant_names,
      (
        SELECT COUNT(*)
        FROM conversation_participants cp
        WHERE cp.conversation_id = c.id
      ) as participant_count,
      (
        SELECT COUNT(*)
        FROM chat_messages m
        WHERE m.conversation_id = c.id
          AND m.sender_id != ?
          AND m.sender_client_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM chat_message_reads r
            WHERE r.message_id = m.id AND r.user_id = ?
          )
      ) + (
        SELECT COUNT(*)
        FROM chat_messages m
        WHERE m.conversation_id = c.id
          AND m.sender_client_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM chat_message_reads r
            WHERE r.message_id = m.id AND r.user_id = ?
          )
      ) as unread_count
    FROM conversations c
    LEFT JOIN clients cl ON cl.id = c.client_id
    JOIN conversation_participants me ON me.conversation_id = c.id AND me.user_id = ?
    ORDER BY COALESCE(last_message_at, c.updated_at) DESC, c.id DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id);

  res.json(conversations);
});

router.post('/conversations', verifyToken, (req, res) => {
  const participantIds = normalizeIds(req.body.participant_ids);
  const title = req.body.title ? String(req.body.title).trim() : '';
  const isGroup = Boolean(req.body.is_group) || participantIds.length > 1 || !!title;

  const activeIds = participantIds.length > 0
    ? db.prepare(`SELECT id FROM users WHERE id IN (${participantIds.map(() => '?').join(',')}) AND is_active=1`).all(...participantIds).map(user => user.id)
    : [];

  const allParticipants = [...new Set([req.user.id, ...activeIds])];
  if (allParticipants.length < 2) {
    return res.status(400).json({ message: 'Select at least one other active user' });
  }

  let conversationId = null;
  if (!isGroup && allParticipants.length === 2) {
    const [firstId, secondId] = allParticipants;
    const existing = db.prepare(`
      SELECT c.id
      FROM conversations c
      JOIN conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = ?
      JOIN conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = ?
      WHERE c.is_group = 0
        AND (SELECT COUNT(*) FROM conversation_participants cp WHERE cp.conversation_id = c.id) = 2
      LIMIT 1
    `).get(firstId, secondId);
    if (existing) conversationId = existing.id;
  }

  try {
    if (!conversationId) {
      const result = db.prepare(`
        INSERT INTO conversations (title, is_group, created_by)
        VALUES (?, ?, ?)
      `).run(title || (isGroup ? 'Group Chat' : 'Direct Message'), isGroup ? 1 : 0, req.user.id);

      conversationId = result.lastInsertRowid;
      const insertParticipant = db.prepare('INSERT OR IGNORE INTO conversation_participants(conversation_id, user_id) VALUES(?, ?)');
      allParticipants.forEach(participantId => insertParticipant.run(conversationId, participantId));
    }

    const conversation = loadConversation(conversationId);
    res.json({ message: 'Conversation ready', conversation });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create conversation: ' + err.message });
  }
});

router.get('/conversations/:id/messages', verifyToken, (req, res) => {
  if (!assertParticipant(req.params.id, req.user.id)) {
    return res.status(403).json({ message: 'You are not part of this conversation' });
  }

  const messages = db.prepare(`
    SELECT m.*, u.name as sender_name, u.avatar as sender_avatar, u.role as sender_role,
           cl.name as sender_client_name
    FROM chat_messages m
    LEFT JOIN users u ON u.id = m.sender_id
    LEFT JOIN clients cl ON cl.id = m.sender_client_id
    WHERE m.conversation_id=?
    ORDER BY m.created_at ASC, m.id ASC
  `).all(req.params.id);

  const attachmentStmt = db.prepare('SELECT * FROM chat_attachments WHERE message_id=? ORDER BY id ASC');
  const readStmt = db.prepare('SELECT user_id, read_at FROM chat_message_reads WHERE message_id=? ORDER BY read_at ASC');
  messages.forEach(message => {
    message.attachments = attachmentStmt.all(message.id);
    message.read_receipts = readStmt.all(message.id);
  });

  res.json(messages);
});

router.get('/conversations/:id/search', verifyToken, (req, res) => {
  if (!assertParticipant(req.params.id, req.user.id)) {
    return res.status(403).json({ message: 'You are not part of this conversation' });
  }
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);

  const rows = db.prepare(`
    SELECT m.*, u.name as sender_name
    FROM chat_messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id=? AND m.message LIKE ?
    ORDER BY m.created_at DESC
    LIMIT 100
  `).all(req.params.id, `%${q}%`);
  res.json(rows);
});

router.put('/conversations/:id/read', verifyToken, (req, res) => {
  if (!assertParticipant(req.params.id, req.user.id)) {
    return res.status(403).json({ message: 'You are not part of this conversation' });
  }
  const unread = db.prepare(`
    SELECT m.id
    FROM chat_messages m
    WHERE m.conversation_id=?
      AND m.sender_id != ?
      AND NOT EXISTS (
        SELECT 1 FROM chat_message_reads r
        WHERE r.message_id = m.id AND r.user_id = ?
      )
  `).all(req.params.id, req.user.id, req.user.id);

  const markRead = db.prepare('INSERT OR IGNORE INTO chat_message_reads(message_id,user_id) VALUES(?,?)');
  unread.forEach(row => markRead.run(row.id, req.user.id));
  res.json({ message: 'Conversation marked as read', count: unread.length });
});

router.post('/conversations/:id/typing', verifyToken, (req, res) => {
  if (!assertParticipant(req.params.id, req.user.id)) {
    return res.status(403).json({ message: 'You are not part of this conversation' });
  }
  const participants = db.prepare('SELECT user_id FROM conversation_participants WHERE conversation_id=?').all(req.params.id).map(p => p.user_id);
  publish('chat.typing', {
    conversationId: Number(req.params.id),
    userId: req.user.id,
    userName: req.user.name,
    isTyping: Boolean(req.body?.isTyping),
    participantIds: participants,
    at: new Date().toISOString()
  });
  res.json({ message: 'Typing status published' });
});

router.post('/conversations/:id/messages', verifyToken, (req, res) => {
  attachmentUpload.any()(req, res, (uploadErr) => {
    if (uploadErr) return res.status(400).json({ message: uploadErr.message || 'Attachment upload failed' });

  if (!assertParticipant(req.params.id, req.user.id)) {
    return res.status(403).json({ message: 'You are not part of this conversation' });
  }

  const message = String(req.body.message || '').trim();
  const files = Array.isArray(req.files) ? req.files : [];
  if (!message && files.length === 0) return res.status(400).json({ message: 'Message or attachment required' });

  try {
    const result = db.prepare(`
      INSERT INTO chat_messages (conversation_id, sender_id, message)
      VALUES (?, ?, ?)
    `).run(req.params.id, req.user.id, message || '[Attachment]');

    if (files.length > 0) {
      const attachStmt = db.prepare(`
        INSERT INTO chat_attachments (message_id,file_path,file_name,mime_type,file_size)
        VALUES (?,?,?,?,?)
      `);
      files.forEach(file => {
        attachStmt.run(
          result.lastInsertRowid,
          `/uploads/chat/${file.filename}`,
          file.originalname,
          file.mimetype || null,
          file.size || null
        );
      });
    }

    db.prepare('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.params.id);
    notifyParticipants(req.params.id, req.user.id, `New message from ${req.user.name || 'a teammate'}: ${message.slice(0, 120)}`);

    const participants = db.prepare('SELECT user_id FROM conversation_participants WHERE conversation_id=?').all(req.params.id).map(p => p.user_id);

    const sent = db.prepare(`
      SELECT m.*, u.name as sender_name, u.avatar as sender_avatar, u.role as sender_role
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.id=?
    `).get(result.lastInsertRowid);

    sent.attachments = db.prepare('SELECT * FROM chat_attachments WHERE message_id=? ORDER BY id ASC').all(sent.id);

    publish('chat.message', {
      conversationId: Number(req.params.id),
      message: sent,
      participantIds: participants,
      at: new Date().toISOString()
    });

    res.json({ message: 'Message sent', data: sent });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send message: ' + err.message });
  }
  });
});

module.exports = router;