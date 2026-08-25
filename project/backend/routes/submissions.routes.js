const router = require('express').Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken, checkRole } = require('../auth');
const { notifyUsers, notifyByRole } = require('../services/notification.service');
const { validateId, validateEnum, validateString, isValidUrl } = require('../validators');

// Multer setup
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    cb(null, `${Date.now()}_u${req.user.id}_${base}${ext}`);
  }
});
const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.mp4', '.mov', '.docx', '.doc', '.zip', '.rar', '.txt', '.md', '.py', '.js', '.json'];
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  allowedExts.includes(ext) ? cb(null, true) : cb(new Error(`Type ${ext} not allowed`));
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 100 * 1024 * 1024 } });

// Badge assignment helper
async function checkAndAssignBadges(userId) {
  try {
    const recent = db.prepare("SELECT leader_status FROM submissions WHERE submitted_by=? ORDER BY created_at DESC LIMIT 5").all(userId);
    if (recent.length === 5 && recent.every(s => s.leader_status === 'approved')) {
      const updated = db.prepare("UPDATE users SET badge=? WHERE id=? AND (badge IS NULL OR badge!='Top Scorer')").run('Consistent Approver', userId);
      if (updated.changes) await notifyUsers(userId, '🏅 You earned the "Consistent Approver" badge!', 'success', 'Tech Turf Badge Awarded');
    }
    const noRev = db.prepare("SELECT COUNT(*) as cnt FROM submissions WHERE submitted_by=? AND version=1 AND leader_status='approved'").get(userId);
    if (noRev.cnt >= 3) db.prepare("UPDATE users SET badge=? WHERE id=? AND badge IS NULL").run('Zero Revisions', userId);

    const top = db.prepare("SELECT submitted_by,AVG(nexus_score) as avg FROM submissions WHERE nexus_score IS NOT NULL AND created_at>=date('now','start of month') GROUP BY submitted_by ORDER BY avg DESC LIMIT 1").get();
    if (top && top.submitted_by === userId) {
      db.prepare("UPDATE users SET badge='Top Scorer' WHERE id=?").run(userId);
      await notifyUsers(userId, '🏆 You are the Top Scorer this month!', 'success', 'Tech Turf Badge Awarded');
    }
  } catch (e) { console.error('Badge error:', e.message); }
}

// POST /api/submissions
router.post('/', verifyToken, (req, res) => {
  upload.any()(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const { task_id, content_text, client_id, project_name, external_link } = req.body;

      if (!task_id && !project_name) {
        return res.status(400).json({ message: 'Must provide either a Target Task or a Project / Report name.' });
      }

      if (task_id) {
        const taskIdVal = validateId(task_id, 'Task ID');
        if (!taskIdVal.valid) return res.status(400).json({ message: taskIdVal.error });
        const taskExists = db.prepare('SELECT id FROM tasks WHERE id=?').get(taskIdVal.value);
        if (!taskExists) return res.status(400).json({ message: 'Task not found' });
      }

      if (client_id) {
        const clientIdVal = validateId(client_id, 'Client ID');
        if (!clientIdVal.valid) return res.status(400).json({ message: clientIdVal.error });
      }

      if (project_name) {
        const projectNameVal = validateString(project_name, 'Project name', { minLength: 2, maxLength: 120 });
        if (!projectNameVal.valid) return res.status(400).json({ message: projectNameVal.error });
      }

      if (content_text && String(content_text).length > 100000) {
        return res.status(400).json({ message: 'Content too long (max 100000 chars)' });
      }

      if (external_link && !isValidUrl(external_link)) {
        return res.status(400).json({ message: 'Invalid external link' });
      }

      const uploadedFiles = req.files || [];
      const file_paths = uploadedFiles.length > 0
        ? JSON.stringify(uploadedFiles.map(f => `/uploads/${f.filename}`))
        : null;

      if (!content_text && !file_paths && !external_link) {
        return res.status(400).json({ message: 'Provide text content, files, or an external link.' });
      }

      const version = task_id
        ? ((db.prepare("SELECT MAX(version) as v FROM submissions WHERE task_id=? AND submitted_by=?").get(task_id, req.user.id)?.v || 0) + 1)
        : 1;

      const isDirectReport = !task_id;
      const initialLeaderStatus = isDirectReport ? 'approved' : 'pending';

      const result = db.prepare(`
      INSERT INTO submissions(task_id,submitted_by,file_path,content_text,version,client_id,project_name,external_link,leader_status,admin_status)
      VALUES(?,?,?,?,?,?,?,?,?,?)
    `).run(task_id || null, req.user.id, file_paths || null, content_text || null, version, client_id || null, project_name || null, external_link || null, initialLeaderStatus, 'pending');

      if (task_id && task_id !== "") {
        db.prepare("UPDATE tasks SET status='submitted' WHERE id=?").run(task_id);
        db.prepare("INSERT INTO performance_log(user_id,action,task_id) VALUES(?,?,?)").run(req.user.id, 'Submitted work', task_id);

        const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(task_id);
        if (task?.project_id) {
          const project = db.prepare('SELECT team_leader_id FROM projects WHERE id=?').get(task.project_id);
          if (project?.team_leader_id) {
            notifyUsers(project.team_leader_id, `📤 New submission for task "${task?.title}" — review required`, 'info', 'Tech Turf Submission Alert').catch(() => {});
          }
        }
      } else {
        db.prepare("INSERT INTO performance_log(user_id,action,task_id) VALUES(?,?,?)").run(req.user.id, 'Submitted manual work', null);
        notifyByRole('admin', `📤 New manual work for "${project_name || 'Project'}" — review required`, 'info', 'Tech Turf Manual Submission Alert').catch(() => {});
      }

      res.json({ message: 'Submitted successfully', id: result.lastInsertRowid, version });
    } catch (err) {
      console.error('Submission Error:', err);
      res.status(500).json({ message: 'Server error during submission' });
    }
  });
});

// GET /api/submissions
router.get('/', verifyToken, (req, res) => {
  const { task_id, status } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  const allowedStatuses = ['pending', 'approved', 'rejected', 'rework', 'awaiting_admin'];
  let query = `
    SELECT s.*, 
      COALESCE(t.title, 'Manual Upload') as task_title, 
      u.name as submitter_name, u.role as submitter_role,
      COALESCE(p.title, s.project_name) as project_title,
      c.name as client_name,
      COALESCE(s.admin_status, 'pending') as admin_status
    FROM submissions s
    LEFT JOIN tasks t ON t.id=s.task_id
    JOIN users u ON u.id=s.submitted_by
    LEFT JOIN projects p ON p.id=t.project_id
    LEFT JOIN clients c ON c.id=s.client_id
    WHERE 1=1
  `;
  const params = [];
  if (!['admin', 'team_leader'].includes(req.user.role)) {
    query += ' AND s.submitted_by=?'; params.push(req.user.id);
  }
  if (task_id) {
    const taskIdVal = validateId(task_id, 'Task ID');
    if (!taskIdVal.valid) return res.status(400).json({ message: taskIdVal.error });
    query += ' AND s.task_id=?';
    params.push(taskIdVal.value);
  }
  if (status) {
    if (!allowedStatuses.includes(String(status))) return res.status(400).json({ message: 'Invalid status filter' });
    if (status === 'awaiting_admin') {
      query += " AND s.leader_status='approved' AND COALESCE(s.admin_status, 'pending')='pending'";
    } else if (status === 'approved') {
      query += " AND s.leader_status='approved' AND COALESCE(s.admin_status, 'pending')='approved'";
    } else {
      query += ' AND s.leader_status=?';
      params.push(status);
    }
  }
  query += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(query).all(...params).map((row) => {
    if (row.nexus_feedback && typeof row.nexus_feedback === 'string') {
      try { row.nexus_feedback = JSON.parse(row.nexus_feedback); } catch (_) { }
    }
    row.submitted_at = row.created_at;
    return row;
  });
  res.setHeader('x-page', String(page));
  res.setHeader('x-limit', String(limit));
  res.json(rows);
});

// GET /api/submissions/:id
router.get('/:id', verifyToken, (req, res) => {
  const s = db.prepare(`
    SELECT s.*, 
      COALESCE(t.title, 'Manual Upload') as task_title, 
      u.name as submitter_name,
      COALESCE(s.admin_status, 'pending') as admin_status
    FROM submissions s 
    LEFT JOIN tasks t ON t.id=s.task_id 
    JOIN users u ON u.id=s.submitted_by
    WHERE s.id=?
  `).get(req.params.id);
  if (!s) return res.status(404).json({ message: 'Not found' });
  if (s.nexus_feedback && typeof s.nexus_feedback === 'string') {
    try { s.nexus_feedback = JSON.parse(s.nexus_feedback); } catch (_) { }
  }
  res.json(s);
});

// PUT /api/submissions/:id/leader-review
router.put('/:id/leader-review', verifyToken, checkRole('team_leader'), async (req, res) => {
  const { status, note } = req.body;
  const statusVal = validateEnum(status, 'Status', ['approved', 'rejected', 'rework', 'pending']);
  if (!statusVal.valid) return res.status(400).json({ message: statusVal.error });
  const sub = db.prepare('SELECT * FROM submissions WHERE id=?').get(req.params.id);
  if (!sub) return res.status(404).json({ message: 'Not found' });

  db.prepare("UPDATE submissions SET leader_status=?, admin_status='pending' WHERE id=?").run(statusVal.value, sub.id);

  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(sub.task_id);

  if (statusVal.value === 'approved') {
    if (sub.task_id) {
      db.prepare("UPDATE tasks SET status='submitted' WHERE id=?").run(sub.task_id);
    }
    notifyByRole('admin', `📣 Submission for "${task?.title || 'Manual Work'}" is ready for admin approval`, 'info', 'Tech Turf Admin Review Needed').catch(() => {});
  } else if (statusVal.value === 'rejected') {
    if (sub.task_id) {
      db.prepare("UPDATE tasks SET status='rejected' WHERE id=?").run(sub.task_id);
    }
    notifyUsers(sub.submitted_by, `❌ Your submission for "${task?.title}" was rejected. ${note || ''}`, 'danger', 'Tech Turf Submission Rejected').catch(() => {});
  } else {
    if (sub.task_id) {
      db.prepare("UPDATE tasks SET status='rework' WHERE id=?").run(sub.task_id);
    }
    notifyUsers(sub.submitted_by, `🔄 Your submission for "${task?.title}" needs rework. ${note || ''}`, 'warning', 'Tech Turf Submission Needs Rework').catch(() => {});
  }
  res.json({ message: `Submission ${statusVal.value}` });
});

// PUT /api/submissions/:id/admin-review
router.put('/:id/admin-review', verifyToken, checkRole('admin'), async (req, res) => {
  const { status, note } = req.body;
  const statusVal = validateEnum(status, 'Status', ['approved', 'rejected', 'rework']);
  if (!statusVal.valid) return res.status(400).json({ message: statusVal.error });
  const sub = db.prepare('SELECT * FROM submissions WHERE id=?').get(req.params.id);
  if (!sub) return res.status(404).json({ message: 'Not found' });

  if (sub.task_id && sub.leader_status !== 'approved') {
    return res.status(409).json({ message: 'Submission must be approved by team leader before admin review' });
  }

  db.prepare("UPDATE submissions SET admin_status=?, admin_override=? WHERE id=?").run(statusVal.value, note || 'Admin review', req.params.id);

  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(sub.task_id);

  if (statusVal.value === 'approved') {
    if (sub.task_id) {
      db.prepare("UPDATE tasks SET status='approved' WHERE id=?").run(sub.task_id);
    }
    db.prepare("UPDATE users SET points=points+10 WHERE id=?").run(sub.submitted_by);
    if (sub.task_id) {
      db.prepare("INSERT INTO performance_log(user_id,action,score,task_id) VALUES(?,?,?,?)").run(sub.submitted_by, 'Task Approved', 10, sub.task_id);
    } else {
      db.prepare("INSERT INTO performance_log(user_id,action,score,task_id) VALUES(?,?,?,?)").run(sub.submitted_by, 'Manual Submission Approved', 10, null);
    }
    notifyUsers(sub.submitted_by, `✅ Your submission for "${task?.title || sub.project_name || 'Project'}" was finally APPROVED by admin! +10 points`, 'success', 'Tech Turf Submission Approved').catch(() => {});
    await checkAndAssignBadges(sub.submitted_by);
  } else if (statusVal.value === 'rejected') {
    if (sub.task_id) {
      db.prepare("UPDATE tasks SET status='rejected' WHERE id=?").run(sub.task_id);
    }
    notifyUsers(sub.submitted_by, `❌ Your submission for "${task?.title || sub.project_name || 'Project'}" was rejected by admin. ${note || ''}`, 'danger', 'Tech Turf Submission Rejected').catch(() => {});
  } else {
    if (sub.task_id) {
      db.prepare("UPDATE tasks SET status='rework' WHERE id=?").run(sub.task_id);
    }
    notifyUsers(sub.submitted_by, `🔄 Your submission for "${task?.title || sub.project_name || 'Project'}" needs more work from admin review. ${note || ''}`, 'warning', 'Tech Turf Submission Needs Rework').catch(() => {});
  }

  res.json({ message: `Admin review ${statusVal.value}` });
});

// DELETE /api/submissions/:id
router.delete('/:id', verifyToken, (req, res) => {
  try {
    const sub = db.prepare('SELECT * FROM submissions WHERE id=?').get(req.params.id);
    if (!sub) return res.status(404).json({ message: 'Submission not found' });

    const isAdmin = req.user.role === 'admin' || (req.user.secondary_roles || '').split(',').includes('admin');
    const isOwner = sub.submitted_by === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: 'Permission denied: You can only delete your own reports or need admin rights.' });
    }

    db.prepare('DELETE FROM submissions WHERE id=?').run(req.params.id);
    res.json({ message: 'Report / Submission deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete submission' });
  }
});

module.exports = router;
