const router = require('express').Router();
const db     = require('../db');
const { verifyToken, checkRole, hashPassword, isStrongPassword, checkPermission } = require('../auth');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { sendMail } = require('../services/mailer');
const { notifyUsers } = require('../services/notification.service');

const avatarsDir = path.join(__dirname, '../../storage/uploads/avatars');
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png';
    cb(null, `avatar_u${req.user.id}_${Date.now()}${safeExt}`);
  }
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// GET /api/users
router.get('/', verifyToken, (req, res) => {
  const { role, search, is_active } = req.query;
  let query  = 'SELECT id,name,email,role,secondary_roles,avatar,badge,points,mobile,github_link,linkedin_link,instagram_link,bio,department,branch,site,employment_status,offboarding_note,is_active,created_at FROM users WHERE 1=1';
  const params = [];
  if (role) { 
    query += ' AND (role=? OR secondary_roles LIKE ?)'; 
    params.push(role, `%${role}%`); 
  }
  if (search) { query += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`,`%${search}%`); }
  if (is_active !== undefined && is_active !== '') {
    query += ' AND is_active=?';
    params.push(Number(is_active));
  }
  
  const isAdmin = req.user.role === 'admin' || (req.user.secondary_roles || '').split(',').map(r => r.trim()).includes('admin');
  if (!isAdmin) { 
    query += ' AND is_active=1'; 
  } else {
    query += ' AND is_active >= 0'; // Hide soft-deleted users
  }
  
  query += ' ORDER BY name ASC';
  res.json(db.prepare(query).all(...params));
});

// GET /api/users/:id
router.get('/:id', verifyToken, (req, res) => {
  const user = db.prepare('SELECT id,name,email,role,secondary_roles,avatar,badge,points,mobile,github_link,linkedin_link,instagram_link,bio,department,branch,site,employment_status,offboarding_note,is_active,created_at FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ message: 'Not found' });
  res.json(user);
});

const handleSelfProfileUpdate = (req, res) => {
  const { name, mobile, github_link, linkedin_link, instagram_link, bio } = req.body;

  if (github_link !== undefined && github_link !== null && github_link !== '') {
    const validGitHub = /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/?$/i.test(github_link.trim());
    if (!validGitHub && !github_link.trim().startsWith('http')) {
      // Allow flexible format or validate
    }
  }

  const avatarPath = req.file ? `/uploads/avatars/${req.file.filename}` : undefined;

  try {
    db.prepare(`
      UPDATE users
      SET
        name=COALESCE(?,name),
        mobile=COALESCE(?,mobile),
        github_link=COALESCE(?,github_link),
        linkedin_link=COALESCE(?,linkedin_link),
        instagram_link=COALESCE(?,instagram_link),
        bio=COALESCE(?,bio),
        avatar=COALESCE(?,avatar)
      WHERE id=?
    `).run(
      name !== undefined ? String(name).trim() : null,
      mobile !== undefined ? String(mobile).trim() : null,
      github_link !== undefined ? String(github_link).trim() : null,
      linkedin_link !== undefined ? String(linkedin_link).trim() : null,
      instagram_link !== undefined ? String(instagram_link).trim() : null,
      bio !== undefined ? String(bio).trim() : null,
      avatarPath !== undefined ? avatarPath : null,
      req.user.id
    );

    const updated = db.prepare('SELECT id,name,email,role,secondary_roles,avatar,badge,points,mobile,github_link,linkedin_link,instagram_link,bio,is_active,created_at FROM users WHERE id=?').get(req.user.id);
    res.json({ message: 'Profile updated', user: updated });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

// Support both PUT (REST) and POST (FormData helper compatibility)
router.put('/me/profile', verifyToken, avatarUpload.single('avatar'), handleSelfProfileUpdate);
router.post('/me/profile', verifyToken, avatarUpload.single('avatar'), handleSelfProfileUpdate);

// GET /api/users/:id/performance
router.get('/:id/performance', verifyToken, (req, res) => {
  const logs = db.prepare('SELECT *, created_at as logged_at FROM performance_log WHERE user_id=? ORDER BY created_at DESC LIMIT 30').all(req.params.id);
  const submissions = db.prepare(`
    SELECT s.*, t.title as task_title, s.created_at as submitted_at FROM submissions s
    JOIN tasks t ON t.id = s.task_id
    WHERE s.submitted_by=? ORDER BY s.created_at DESC LIMIT 10
  `).all(req.params.id);
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      AVG(nexus_score) as avg_score,
      SUM(CASE WHEN leader_status='approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN leader_status='rejected' THEN 1 ELSE 0 END) as rejected
    FROM submissions WHERE submitted_by=?
  `).get(req.params.id);
  const score_history = db.prepare(`
    SELECT DATE(created_at) as date, ROUND(AVG(nexus_score), 1) as score
    FROM submissions
    WHERE submitted_by=? AND nexus_score IS NOT NULL
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) ASC
  `).all(req.params.id);
  res.json({ logs, submissions, stats, score_history });
});

// POST /api/users
router.post('/', verifyToken, checkPermission('users.edit'), async (req, res) => {
  const { name, email, password, role, secondary_roles, department, branch, site, employment_status } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ message: 'All fields required' });
  if (!isStrongPassword(password)) {
    return res.status(400).json({ message: 'Password must be at least 10 chars and include upper, lower, number, and symbol' });
  }
  try {
    const hash = await hashPassword(password);
    const result = db.prepare('INSERT INTO users(name,email,password,role,secondary_roles,department,branch,site,employment_status) VALUES(?,?,?,?,?,?,?,?,?)').run(
      name,
      email.toLowerCase().trim(),
      hash,
      role,
      secondary_roles || '',
      department || '',
      branch || '',
      site || '',
      employment_status || 'active'
    );
    res.json({ message: 'User created', id: result.lastInsertRowid });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ message: 'Email already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/users/:id
router.put('/:id', verifyToken, checkPermission('users.edit'), (req, res) => {
  const { name, role, secondary_roles, is_active, badge, points, department, branch, site, employment_status, offboarding_note } = req.body;
  try {
    db.prepare('UPDATE users SET name=COALESCE(?,name), role=COALESCE(?,role), secondary_roles=COALESCE(?,secondary_roles), is_active=COALESCE(?,is_active), badge=COALESCE(?,badge), points=COALESCE(?,points), department=COALESCE(?,department), branch=COALESCE(?,branch), site=COALESCE(?,site), employment_status=COALESCE(?,employment_status), offboarding_note=COALESCE(?,offboarding_note) WHERE id=?')
      .run(
        name !== undefined ? name : null,
        role !== undefined ? role : null,
        secondary_roles !== undefined ? secondary_roles : null,
        is_active !== undefined ? is_active : null,
        badge !== undefined ? badge : null,
        points !== undefined ? points : null,
        department !== undefined ? department : null,
        branch !== undefined ? branch : null,
        site !== undefined ? site : null,
        employment_status !== undefined ? employment_status : null,
        offboarding_note !== undefined ? offboarding_note : null,
        req.params.id
      );
    res.json({ message: 'User updated' });
  } catch(err) {
    console.error('Update User 500 Error:', err);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', verifyToken, checkPermission('users.lifecycle'), (req, res) => {
  const targetId = Number(req.params.id);
  const selfId = Number(req.user.id);
  
  if (targetId === selfId) {
    return res.status(400).json({ message: 'Refinement Error: Cannot self-terminate administrative account.' });
  }

  try {
    // Safe soft-delete to prevent foreign key errors for related tasks/projects
    // Use parameter binding for the id in the email concatenation to be 100% safe
    const sql = `
      UPDATE users 
      SET name = '[Deleted User]', 
          email = 'deleted_' || id || '@techturf.internal', 
          password = '*', 
          is_active = -1 
      WHERE id = ?
    `;
    const result = db.prepare(sql).run(targetId);
    
    if (result.changes === 0) {
      return res.status(404).json({ message: 'Target user not found or already purged' });
    }

    res.json({ message: 'User soft-deletion successful' });
  } catch (err) {
    console.error('CRITICAL: User deletion failed for ID:', targetId, err.message);
    res.status(500).json({ message: 'System error: ' + err.message });
  }
});

// PUT /api/users/:id/password (admin resets user password)
router.post('/password-reset-otp', verifyToken, checkPermission('users.edit'), async (req, res) => {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO password_reset_otps(user_id,purpose,otp,expires_at) VALUES(?,?,?,?)')
    .run(req.user.id, 'admin_password_reset', otp, expiresAt);

  const admin = db.prepare('SELECT email,name FROM users WHERE id=?').get(req.user.id);
  await sendMail({
    to: admin?.email,
    subject: 'Tech Turf OTP for Admin Password Reset',
    text: `Hi ${admin?.name || 'Admin'},\n\nYour OTP for admin password reset is ${otp}.\nExpires in 10 minutes.\n\n- Tech Turf`
  });
  res.json({ message: 'OTP sent to your email' });
});

router.put('/:id/password', verifyToken, checkPermission('users.edit'), async (req, res) => {
  const { password, otp } = req.body;
  if (!password) return res.status(400).json({ message: 'Password required' });
  if (!isStrongPassword(password)) return res.status(400).json({ message: 'Weak password: min 10 chars with upper/lower/number/symbol' });
  if (!otp) return res.status(400).json({ message: 'OTP required' });

  const otpRow = db.prepare(`
    SELECT * FROM password_reset_otps
    WHERE user_id=? AND purpose='admin_password_reset' AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(req.user.id);

  if (!otpRow) return res.status(400).json({ message: 'No active OTP found' });
  if (String(otpRow.otp) !== String(otp)) return res.status(400).json({ message: 'Invalid OTP' });
  if (new Date(otpRow.expires_at).getTime() < Date.now()) return res.status(400).json({ message: 'OTP expired' });

  const hash = await hashPassword(password);
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, req.params.id);
  db.prepare('UPDATE password_reset_otps SET used_at=CURRENT_TIMESTAMP WHERE id=?').run(otpRow.id);

  const target = db.prepare('SELECT id,name FROM users WHERE id=?').get(req.params.id);
  if (target) {
    await notifyUsers(target.id, 'Your account password was reset by an administrator.', 'warning', 'Tech Turf Password Reset Notice');
  }

  res.json({ message: 'Password reset' });
});

// GET /api/users/:id/logins (admin only)
router.get('/:id/logins', verifyToken, checkPermission('users.view'), (req, res) => {
  const logins = db.prepare('SELECT * FROM login_log WHERE user_id=? ORDER BY login_at DESC LIMIT 30').all(req.params.id);
  res.json(logins);
});

router.put('/:id/lifecycle', verifyToken, checkPermission('users.lifecycle'), async (req, res) => {
  const { employment_status, offboarding_note, branch, site, department } = req.body;
  const allowed = ['active', 'probation', 'suspended', 'exited'];
  if (!allowed.includes(String(employment_status || '').toLowerCase())) {
    return res.status(400).json({ message: 'Invalid employment_status' });
  }

  const user = db.prepare('SELECT id,name FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const targetStatus = String(employment_status).toLowerCase();
  db.prepare(`
    UPDATE users
    SET employment_status=?,
        is_active=?,
        offboarding_note=COALESCE(?, offboarding_note),
        branch=COALESCE(?, branch),
        site=COALESCE(?, site),
        department=COALESCE(?, department)
    WHERE id=?
  `).run(
    targetStatus,
    targetStatus === 'active' || targetStatus === 'probation' ? 1 : 0,
    offboarding_note !== undefined ? offboarding_note : null,
    branch !== undefined ? branch : null,
    site !== undefined ? site : null,
    department !== undefined ? department : null,
    req.params.id
  );

  await notifyUsers(user.id, `Your account lifecycle status is now: ${targetStatus}.`, targetStatus === 'suspended' ? 'danger' : 'info', 'Tech Turf Account Lifecycle Update');
  res.json({ message: 'Lifecycle updated' });
});

router.put('/:id/scope', verifyToken, checkPermission('users.edit'), (req, res) => {
  const { scope_type, branch, site, team_id } = req.body;
  const type = scope_type || 'global';

  db.prepare('DELETE FROM access_scopes WHERE user_id=?').run(req.params.id);
  db.prepare('INSERT INTO access_scopes(user_id,scope_type,branch,site,team_id,created_by) VALUES(?,?,?,?,?,?)')
    .run(req.params.id, type, branch || null, site || null, team_id || null, req.user.id);

  res.json({ message: 'Access scope updated' });
});

module.exports = router;
