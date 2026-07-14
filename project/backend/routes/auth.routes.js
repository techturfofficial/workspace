const router  = require('express').Router();
const db      = require('../db');
const crypto = require('crypto');
const { hashPassword, comparePassword, generateToken, verifyToken, isStrongPassword, checkPermission } = require('../auth');
const { sendMail } = require('../services/mailer');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ message: 'No users found in database' });
  if (['suspended', 'exited'].includes((user.employment_status || '').toLowerCase())) {
    return res.status(403).json({ message: `Account is ${user.employment_status}` });
  }
  const valid = await comparePassword(password, user.password);
  if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

  // Log login event
  try {
    db.prepare('INSERT INTO login_log(user_id, ip, user_agent) VALUES (?, ?, ?)')
      .run(user.id, req.headers['x-forwarded-for'] || req.connection.remoteAddress || '', req.headers['user-agent'] || '');
  } catch (e) { /* ignore logging errors */ }
  const token = generateToken(user);
  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

// GET /api/auth/me
router.get('/me', verifyToken, (req, res) => {
  const user = db.prepare('SELECT id,name,email,role,secondary_roles,avatar,badge,points,mobile,github_link,bio,department,branch,site,employment_status,is_active,created_at FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

// POST /api/auth/register (admin only)
router.post('/register', verifyToken, checkPermission('users.edit'), async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ message: 'All fields required' });
  if (!isStrongPassword(password)) {
    return res.status(400).json({ message: 'Password must be at least 10 chars and include upper, lower, number, and symbol' });
  }
  try {
    const hash = await hashPassword(password);
    const result = db.prepare('INSERT INTO users(name,email,password,role,employment_status) VALUES(?,?,?,?,?)').run(name, email.toLowerCase().trim(), hash, role, 'active');
    res.json({ message: 'User created', id: result.lastInsertRowid });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ message: 'Email already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/auth/invite/:token
router.get('/invite/:token', (req, res) => {
  const invite = db.prepare('SELECT id,email,name,department,role,secondary_roles,branch,site,expires_at,status FROM invitations WHERE token=?').get(req.params.token);
  if (!invite) return res.status(404).json({ message: 'Invite not found' });
  if (invite.status !== 'pending') return res.status(400).json({ message: 'Invite already used or cancelled' });
  if (new Date(invite.expires_at).getTime() < Date.now()) return res.status(400).json({ message: 'Invite expired' });
  res.json(invite);
});

// POST /api/auth/invite/:token/accept
router.post('/invite/:token/accept', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ message: 'Password required' });
  if (!isStrongPassword(password)) {
    return res.status(400).json({ message: 'Password must be at least 10 chars and include upper, lower, number, and symbol' });
  }

  const invite = db.prepare('SELECT * FROM invitations WHERE token=?').get(req.params.token);
  if (!invite) return res.status(404).json({ message: 'Invite not found' });
  if (invite.status !== 'pending') return res.status(400).json({ message: 'Invite already used or cancelled' });
  if (new Date(invite.expires_at).getTime() < Date.now()) return res.status(400).json({ message: 'Invite expired' });

  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(String(invite.email).toLowerCase().trim());
  if (existing) return res.status(409).json({ message: 'User already exists for this invite email' });

  try {
    const hash = await hashPassword(password);
    const result = db.prepare(`
      INSERT INTO users(name,email,password,role,secondary_roles,department,branch,site,employment_status)
      VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
      invite.name || invite.email.split('@')[0],
      String(invite.email).toLowerCase().trim(),
      hash,
      invite.role || 'writer',
      invite.secondary_roles || '',
      invite.department || null,
      invite.branch || null,
      invite.site || null,
      'active'
    );

    db.prepare('UPDATE invitations SET status=?, accepted_at=CURRENT_TIMESTAMP WHERE id=?').run('accepted', invite.id);

    await sendMail({
      to: invite.email,
      subject: 'Welcome to Tech Turf',
      text: `Hi ${invite.name || 'there'},\n\nYour account is now active. You can log in using your invited email.\n\n- Tech Turf`
    });

    res.json({ message: 'Invitation accepted', user_id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ message: 'Failed to accept invitation' });
  }
});

// POST /api/auth/invitations (admin)
router.post('/invitations', verifyToken, checkPermission('invites.manage'), async (req, res) => {
  const { email, name, department, role, secondary_roles, branch, site, team_id, expires_hours } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });

  const token = crypto.randomBytes(24).toString('hex');
  const expiryHours = Number(expires_hours || 72);
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const result = db.prepare(`
    INSERT INTO invitations(email,name,department,role,secondary_roles,branch,site,team_id,token,expires_at,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    String(email).toLowerCase().trim(),
    name || '',
    department || '',
    role || 'writer',
    secondary_roles || '',
    branch || '',
    site || '',
    team_id || null,
    token,
    expiresAt,
    req.user.id
  );

  const inviteLink = `${req.protocol}://${req.get('host')}/index.html#invite=${token}`;
  await sendMail({
    to: String(email).toLowerCase().trim(),
    subject: 'Tech Turf Employee Invitation',
    text: `Hi ${name || 'there'},\n\nYou have been invited to Tech Turf.\nAccept here: ${inviteLink}\nThis link expires on ${expiresAt}.\n\n- Tech Turf`
  });

  res.json({ message: 'Invitation sent', id: result.lastInsertRowid, invite_link: inviteLink });
});

router.get('/invitations', verifyToken, checkPermission('invites.manage'), (req, res) => {
  const rows = db.prepare('SELECT * FROM invitations ORDER BY created_at DESC LIMIT 200').all();
  res.json(rows);
});

module.exports = router;
