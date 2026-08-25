const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { verifyToken, checkRole, checkPermission } = require('../auth');
const { sendMail } = require('../services/mailer');
const { notifyUsers } = require('../services/notification.service');

function toCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const text = String(value === null || value === undefined ? '' : value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const lines = [headers.map(escape).join(',')];
  rows.forEach(row => lines.push(headers.map(h => escape(row[h])).join(',')));
  return lines.join('\n');
}

router.get('/health', (req, res) => {
  let dbWritable = false;
  let uploadsWritable = false;
  const uploadsDir = path.join(__dirname, '../../uploads');
  try {
    db.prepare('CREATE TABLE IF NOT EXISTS __health_check (id INTEGER PRIMARY KEY, ping TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)').run();
    db.prepare("INSERT INTO __health_check (ping) VALUES ('ok')").run();
    db.prepare('DELETE FROM __health_check WHERE id IN (SELECT id FROM __health_check ORDER BY id DESC LIMIT 1)').run();
    dbWritable = true;
  } catch (err) {
    dbWritable = false;
  }

  try {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    fs.accessSync(uploadsDir, fs.constants.W_OK);
    uploadsWritable = true;
  } catch (err) {
    uploadsWritable = false;
  }

  const requiredEnv = ['JWT_SECRET'];
  const envStatus = requiredEnv.map(key => ({ key, present: Boolean(process.env[key]) }));

  res.json({
    service: 'Tech Turf Enterprise Health',
    dbWritable,
    uploadsWritable,
    envStatus,
    timestamp: new Date().toISOString()
  });
});

router.get('/monitoring/summary', verifyToken, checkPermission('reports.view'), (req, res) => {
  const metrics = {
    users: db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active=1').get().c,
    suspendedUsers: db.prepare("SELECT COUNT(*) as c FROM users WHERE employment_status='suspended'").get().c,
    projects: db.prepare("SELECT COUNT(*) as c FROM projects WHERE status != 'archived'").get().c,
    tasksPending: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending','in_progress','rework')").get().c,
    submissionsPending: db.prepare("SELECT COUNT(*) as c FROM submissions WHERE leader_status='pending'").get().c,
    unreadNotifications: db.prepare('SELECT COUNT(*) as c FROM notifications WHERE is_read=0').get().c,
    openInboxThreads: db.prepare("SELECT COUNT(*) as c FROM team_inbox_threads WHERE status != 'closed'").get().c,
    queuedJobs: db.prepare("SELECT COUNT(*) as c FROM job_queue WHERE status='pending'").get().c,
    timestamp: new Date().toISOString()
  };
  res.json(metrics);
});

router.get('/permissions-matrix', verifyToken, checkPermission('users.view'), (req, res) => {
  const templates = db.prepare('SELECT * FROM role_templates ORDER BY department, name').all();
  const permissions = db.prepare('SELECT * FROM permissions ORDER BY category, key').all();
  const links = db.prepare('SELECT * FROM role_template_permissions').all();
  res.json({ templates, permissions, links });
});

router.post('/role-templates', verifyToken, checkPermission('users.edit'), (req, res) => {
  const { name, department, primary_role, secondary_roles, description } = req.body;
  if (!name) return res.status(400).json({ message: 'Template name required' });
  const result = db.prepare(`
    INSERT INTO role_templates(name,department,primary_role,secondary_roles,description,created_by)
    VALUES(?,?,?,?,?,?)
  `).run(name, department || '', primary_role || 'writer', secondary_roles || '', description || '', req.user.id);
  res.json({ message: 'Role template created', id: result.lastInsertRowid });
});

router.put('/role-templates/:id', verifyToken, checkPermission('users.edit'), (req, res) => {
  const { name, department, primary_role, secondary_roles, description } = req.body;
  db.prepare(`
    UPDATE role_templates
    SET name=COALESCE(?,name), department=COALESCE(?,department), primary_role=COALESCE(?,primary_role),
        secondary_roles=COALESCE(?,secondary_roles), description=COALESCE(?,description), updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    name !== undefined ? name : null,
    department !== undefined ? department : null,
    primary_role !== undefined ? primary_role : null,
    secondary_roles !== undefined ? secondary_roles : null,
    description !== undefined ? description : null,
    req.params.id
  );
  res.json({ message: 'Role template updated' });
});

router.delete('/role-templates/:id', verifyToken, checkPermission('users.edit'), (req, res) => {
  db.prepare('DELETE FROM role_templates WHERE id=?').run(req.params.id);
  res.json({ message: 'Role template deleted' });
});

router.put('/role-templates/:id/permissions', verifyToken, checkPermission('users.edit'), (req, res) => {
  const permissionKeys = Array.isArray(req.body.permission_keys) ? req.body.permission_keys : [];
  db.prepare('DELETE FROM role_template_permissions WHERE template_id=?').run(req.params.id);
  const stmt = db.prepare('INSERT OR IGNORE INTO role_template_permissions(template_id,permission_key) VALUES(?,?)');
  permissionKeys.forEach(key => stmt.run(req.params.id, key));
  res.json({ message: 'Template permissions updated' });
});

router.post('/role-templates/:id/apply/:userId', verifyToken, checkPermission('users.edit'), (req, res) => {
  const template = db.prepare('SELECT * FROM role_templates WHERE id=?').get(req.params.id);
  if (!template) return res.status(404).json({ message: 'Template not found' });

  db.prepare(`
    UPDATE users
    SET role=?, secondary_roles=?, department=COALESCE(?, department)
    WHERE id=?
  `).run(template.primary_role || 'writer', template.secondary_roles || '', template.department || null, req.params.userId);

  res.json({ message: 'Template applied to user' });
});

router.post('/team-announcements', verifyToken, checkPermission('announcements.manage'), async (req, res) => {
  const { team_id, title, body, pinned } = req.body;
  if (!title) return res.status(400).json({ message: 'Title required' });
  const result = db.prepare('INSERT INTO team_announcements(team_id,title,body,pinned,created_by) VALUES(?,?,?,?,?)')
    .run(team_id || null, title, body || '', pinned ? 1 : 0, req.user.id);

  let recipients = [];
  if (team_id) {
    recipients = db.prepare('SELECT user_id FROM team_members WHERE team_id=?').all(team_id).map(r => r.user_id);
  } else {
    recipients = db.prepare('SELECT id FROM users WHERE is_active=1').all().map(r => r.id);
  }

  await notifyUsers(recipients, `📢 ${title}`, 'info', 'Tech Turf Announcement');
  res.json({ message: 'Announcement published', id: result.lastInsertRowid });
});

router.get('/team-announcements', verifyToken, (req, res) => {
  const { team_id } = req.query;
  let rows;
  if (team_id) {
    rows = db.prepare('SELECT * FROM team_announcements WHERE team_id=? ORDER BY pinned DESC, created_at DESC').all(team_id);
  } else {
    rows = db.prepare('SELECT * FROM team_announcements ORDER BY pinned DESC, created_at DESC').all();
  }
  res.json(rows);
});

router.post('/team-inbox/threads', verifyToken, checkRole('admin', 'team_leader', 'client_handler'), (req, res) => {
  const { team_id, client_id, subject } = req.body;
  if (!team_id || !subject) return res.status(400).json({ message: 'team_id and subject required' });
  const result = db.prepare('INSERT INTO team_inbox_threads(team_id,client_id,subject,created_by) VALUES(?,?,?,?)')
    .run(team_id, client_id || null, subject, req.user.id);
  res.json({ message: 'Thread created', id: result.lastInsertRowid });
});

router.get('/team-inbox/threads', verifyToken, (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, tm.name as team_name, c.name as client_name
    FROM team_inbox_threads t
    LEFT JOIN teams tm ON tm.id=t.team_id
    LEFT JOIN clients c ON c.id=t.client_id
    ORDER BY t.updated_at DESC
  `).all();
  res.json(rows);
});

router.post('/team-inbox/threads/:id/messages', verifyToken, (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ message: 'Message required' });
  db.prepare('INSERT INTO team_inbox_messages(thread_id,sender_id,message) VALUES(?,?,?)').run(req.params.id, req.user.id, message);
  db.prepare('UPDATE team_inbox_threads SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.params.id);
  res.json({ message: 'Thread message sent' });
});

router.get('/team-inbox/threads/:id/messages', verifyToken, (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, u.name as sender_name
    FROM team_inbox_messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.thread_id=?
    ORDER BY m.created_at ASC
  `).all(req.params.id);
  res.json(rows);
});

router.post('/task-templates', verifyToken, checkRole('admin', 'team_leader'), (req, res) => {
  const { name, role, team_id, title, description, priority, sla_hours } = req.body;
  if (!name || !title) return res.status(400).json({ message: 'name and title required' });
  const result = db.prepare(`
    INSERT INTO task_templates(name,role,team_id,title,description,priority,sla_hours,created_by)
    VALUES(?,?,?,?,?,?,?,?)
  `).run(name, role || '', team_id || null, title, description || '', priority || 'normal', Number(sla_hours || 24), req.user.id);
  res.json({ message: 'Task template created', id: result.lastInsertRowid });
});

router.get('/task-templates', verifyToken, (req, res) => {
  const rows = db.prepare('SELECT * FROM task_templates ORDER BY created_at DESC').all();
  res.json(rows);
});

router.post('/recurring-tasks', verifyToken, checkRole('admin', 'team_leader'), (req, res) => {
  const { template_id, frequency, next_run_at } = req.body;
  if (!template_id || !frequency || !next_run_at) return res.status(400).json({ message: 'template_id, frequency, next_run_at required' });
  const result = db.prepare('INSERT INTO recurring_tasks(template_id,frequency,next_run_at,created_by) VALUES(?,?,?,?)')
    .run(template_id, frequency, next_run_at, req.user.id);
  res.json({ message: 'Recurring task scheduled', id: result.lastInsertRowid });
});

router.post('/meeting-notes', verifyToken, checkRole('admin', 'team_leader', 'client_handler'), (req, res) => {
  const { project_id, task_id, client_id, team_id, title, notes } = req.body;
  if (!title) return res.status(400).json({ message: 'title required' });
  const result = db.prepare(`
    INSERT INTO meeting_notes(project_id,task_id,client_id,team_id,title,notes,created_by)
    VALUES(?,?,?,?,?,?,?)
  `).run(project_id || null, task_id || null, client_id || null, team_id || null, title, notes || '', req.user.id);
  res.json({ message: 'Meeting note added', id: result.lastInsertRowid });
});

router.get('/meeting-notes', verifyToken, (req, res) => {
  const rows = db.prepare('SELECT * FROM meeting_notes ORDER BY created_at DESC LIMIT 300').all();
  res.json(rows);
});

router.get('/my-day', verifyToken, (req, res) => {
  const taskRows = db.prepare(`
    SELECT id,title,status,priority,deadline,project_id
    FROM tasks
    WHERE (assigned_to=? OR id IN (SELECT task_id FROM task_members WHERE user_id=?))
      AND status IN ('pending','in_progress','rework')
    ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, deadline ASC
    LIMIT 50
  `).all(req.user.id, req.user.id);

  const notifRows = db.prepare('SELECT * FROM notifications WHERE user_id=? AND is_read=0 ORDER BY created_at DESC LIMIT 20').all(req.user.id);
  const approvals = db.prepare("SELECT COUNT(*) as c FROM submissions WHERE leader_status='pending'").get().c;

  res.json({
    user_id: req.user.id,
    tasks: taskRows,
    unread_notifications: notifRows,
    approvals_pending: approvals,
    generated_at: new Date().toISOString()
  });
});

router.post('/work-sessions/start', verifyToken, (req, res) => {
  const result = db.prepare('INSERT INTO work_sessions(user_id,started_at,source) VALUES(?,?,?)').run(req.user.id, new Date().toISOString(), req.body?.source || 'manual');
  res.json({ message: 'Work session started', id: result.lastInsertRowid });
});

router.post('/work-sessions/:id/stop', verifyToken, (req, res) => {
  const row = db.prepare('SELECT * FROM work_sessions WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ message: 'Session not found' });
  const endAt = new Date();
  const startAt = new Date(row.started_at);
  const duration = Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 60000));
  db.prepare('UPDATE work_sessions SET ended_at=?, duration_minutes=? WHERE id=?').run(endAt.toISOString(), duration, req.params.id);
  res.json({ message: 'Work session stopped', duration_minutes: duration });
});

router.get('/work-sessions', verifyToken, (req, res) => {
  const rows = db.prepare('SELECT * FROM work_sessions WHERE user_id=? ORDER BY started_at DESC LIMIT 100').all(req.user.id);
  res.json(rows);
});

router.post('/goals', verifyToken, checkRole('admin', 'team_leader'), (req, res) => {
  const { user_id, team_id, title, target_value, due_date } = req.body;
  if (!title || (!user_id && !team_id)) return res.status(400).json({ message: 'title and user_id/team_id required' });
  const result = db.prepare('INSERT INTO goals(user_id,team_id,title,target_value,due_date,created_by) VALUES(?,?,?,?,?,?)')
    .run(user_id || null, team_id || null, title, target_value || null, due_date || null, req.user.id);
  res.json({ message: 'Goal created', id: result.lastInsertRowid });
});

router.get('/goals', verifyToken, (req, res) => {
  const rows = db.prepare('SELECT * FROM goals ORDER BY updated_at DESC').all();
  res.json(rows);
});

router.put('/goals/:id', verifyToken, checkRole('admin', 'team_leader'), (req, res) => {
  const { current_value, status } = req.body;
  db.prepare('UPDATE goals SET current_value=COALESCE(?,current_value), status=COALESCE(?,status), updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(current_value !== undefined ? current_value : null, status !== undefined ? status : null, req.params.id);
  res.json({ message: 'Goal updated' });
});

router.post('/feedback-cycles', verifyToken, checkRole('admin', 'team_leader'), (req, res) => {
  const { user_id, reviewer_id, cycle_name } = req.body;
  if (!user_id) return res.status(400).json({ message: 'user_id required' });
  const result = db.prepare('INSERT INTO feedback_cycles(user_id,reviewer_id,cycle_name) VALUES(?,?,?)')
    .run(user_id, reviewer_id || null, cycle_name || 'Quarterly Review');
  res.json({ message: 'Feedback cycle created', id: result.lastInsertRowid });
});

router.put('/feedback-cycles/:id', verifyToken, (req, res) => {
  const { self_review, manager_review, status } = req.body;
  db.prepare(`
    UPDATE feedback_cycles
    SET self_review=COALESCE(?,self_review), manager_review=COALESCE(?,manager_review), status=COALESCE(?,status), updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    self_review !== undefined ? self_review : null,
    manager_review !== undefined ? manager_review : null,
    status !== undefined ? status : null,
    req.params.id
  );
  res.json({ message: 'Feedback cycle updated' });
});

router.put('/skills/:userId', verifyToken, checkRole('admin', 'team_leader'), (req, res) => {
  const skills = Array.isArray(req.body.skills) ? req.body.skills : [];
  db.prepare('DELETE FROM skill_matrix WHERE user_id=?').run(req.params.userId);
  const stmt = db.prepare('INSERT INTO skill_matrix(user_id,skill,level,last_updated) VALUES(?,?,?,CURRENT_TIMESTAMP)');
  skills.forEach(skill => stmt.run(req.params.userId, skill.name, Number(skill.level || 1)));
  res.json({ message: 'Skill matrix updated' });
});

router.get('/skills/:userId', verifyToken, (req, res) => {
  const rows = db.prepare('SELECT * FROM skill_matrix WHERE user_id=? ORDER BY skill ASC').all(req.params.userId);
  res.json(rows);
});

router.post('/help/articles', verifyToken, (req, res) => {
  const { title, content, role_scope, language } = req.body;
  if (!title || !content) return res.status(400).json({ message: 'title and content required' });
  const result = db.prepare('INSERT INTO help_articles(title,content,role_scope,language,created_by) VALUES(?,?,?,?,?)')
    .run(title, content, role_scope || '', language || 'en', req.user.id);
  res.json({ message: 'Help article created', id: result.lastInsertRowid });
});

router.get('/help/articles', verifyToken, (req, res) => {
  const language = req.query.language || 'en';
  const rows = db.prepare("SELECT * FROM help_articles WHERE language=? OR language='' ORDER BY created_at DESC").all(language);
  res.json(rows);
});

router.post('/feedback', verifyToken, (req, res) => {
  const { page, category, message } = req.body;
  if (!message) return res.status(400).json({ message: 'message required' });
  const result = db.prepare('INSERT INTO user_feedback(user_id,page,category,message) VALUES(?,?,?,?)')
    .run(req.user.id, page || '', category || 'general', message);
  res.json({ message: 'Feedback submitted', id: result.lastInsertRowid });
});

router.get('/feedback', verifyToken, checkRole('admin', 'team_leader'), (req, res) => {
  const rows = db.prepare(`
    SELECT f.*, u.name as user_name
    FROM user_feedback f
    LEFT JOIN users u ON u.id=f.user_id
    ORDER BY f.created_at DESC
    LIMIT 300
  `).all();
  res.json(rows);
});

router.get('/onboarding/me', verifyToken, (req, res) => {
  const row = db.prepare('SELECT * FROM user_onboarding WHERE user_id=?').get(req.user.id) || { user_id: req.user.id, is_completed: 0, walkthrough_version: 'v1' };
  res.json(row);
});

router.put('/onboarding/me', verifyToken, (req, res) => {
  const { is_completed, walkthrough_version } = req.body;
  db.prepare(`
    INSERT INTO user_onboarding(user_id,is_completed,walkthrough_version,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      is_completed=excluded.is_completed,
      walkthrough_version=excluded.walkthrough_version,
      updated_at=CURRENT_TIMESTAMP
  `).run(req.user.id, is_completed ? 1 : 0, walkthrough_version || 'v1');
  res.json({ message: 'Onboarding state updated' });
});

router.get('/policies', verifyToken, (req, res) => {
  const rows = db.prepare('SELECT * FROM policies ORDER BY key ASC').all();
  res.json(rows);
});

router.put('/policies/:key', verifyToken, checkPermission('policies.manage'), (req, res) => {
  const value = req.body?.value;
  db.prepare(`
    INSERT INTO policies(key,value,updated_by,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value=excluded.value,
      updated_by=excluded.updated_by,
      updated_at=CURRENT_TIMESTAMP
  `).run(req.params.key, value === undefined ? '' : String(value), req.user.id);
  res.json({ message: 'Policy updated' });
});

router.delete('/policies/:key', verifyToken, checkPermission('policies.manage'), (req, res) => {
  db.prepare('DELETE FROM policies WHERE key=?').run(req.params.key);
  res.json({ message: 'Policy key removed' });
});


// --- POLICY DOCUMENTS ---
router.get('/policy-documents', verifyToken, (req, res) => {
  const rows = db.prepare(`
    SELECT pd.*, u.name as author_name 
    FROM policy_documents pd 
    LEFT JOIN users u ON u.id = pd.created_by 
    ORDER BY pd.created_at DESC
  `).all();
  res.json(rows);
});

router.get('/policy-documents/:id', verifyToken, (req, res) => {
  const row = db.prepare(`
    SELECT pd.*, u.name as author_name 
    FROM policy_documents pd 
    LEFT JOIN users u ON u.id = pd.created_by 
    WHERE pd.id=?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ message: 'Policy not found' });
  res.json(row);
});

router.post('/policy-documents', verifyToken, checkPermission('policies.manage'), (req, res) => {
  const { title, content, references } = req.body;
  if (!title || !content) return res.status(400).json({ message: 'Title and content required' });

  const result = db.prepare(`
    INSERT INTO policy_documents(title, content, references_json, created_by)
    VALUES(?,?,?,?)
  `).run(title, content, JSON.stringify(references || []), req.user.id);

  res.json({ message: 'Policy document created', id: result.lastInsertRowid });
});

router.delete('/policy-documents/:id', verifyToken, checkPermission('policies.manage'), (req, res) => {
  db.prepare('DELETE FROM policy_documents WHERE id=?').run(req.params.id);
  res.json({ message: 'Policy document deleted' });
});


router.get('/export/:entity', verifyToken, checkRole('admin', 'team_leader'), (req, res) => {
  const map = {
    users: 'SELECT id,name,email,role,secondary_roles,department,branch,site,employment_status,is_active,created_at FROM users',
    teams: 'SELECT * FROM teams',
    clients: 'SELECT * FROM clients',
    tasks: 'SELECT * FROM tasks',
    projects: 'SELECT * FROM projects'
  };
  const sql = map[req.params.entity];
  if (!sql) return res.status(400).json({ message: 'Unsupported export entity' });
  const rows = db.prepare(sql).all();
  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.entity}_export.csv"`);
  res.send(csv);
});

router.post('/jobs', verifyToken, checkRole('admin', 'team_leader'), (req, res) => {
  const { type, payload, run_at } = req.body;
  if (!type) return res.status(400).json({ message: 'type required' });
  const result = db.prepare('INSERT INTO job_queue(type,payload,run_at) VALUES(?,?,?)')
    .run(type, JSON.stringify(payload || {}), run_at || new Date().toISOString());
  res.json({ message: 'Job queued', id: result.lastInsertRowid });
});

router.get('/jobs', verifyToken, checkRole('admin', 'team_leader'), (req, res) => {
  const rows = db.prepare('SELECT * FROM job_queue ORDER BY created_at DESC LIMIT 500').all();
  res.json(rows);
});

router.post('/sla/check', verifyToken, checkRole('admin', 'team_leader'), async (req, res) => {
  const now = new Date();
  const pendingTasks = db.prepare("SELECT * FROM tasks WHERE status IN ('pending','in_progress','rework') AND deadline IS NOT NULL").all();
  let escalations = 0;

  for (const task of pendingTasks) {
    const deadline = new Date(task.deadline);
    if (isNaN(deadline.getTime())) continue;
    if (deadline.getTime() >= now.getTime()) continue;
    const leader = db.prepare('SELECT team_leader_id FROM projects WHERE id=?').get(task.project_id);
    const escalatedTo = leader?.team_leader_id || null;
    db.prepare('INSERT INTO escalation_log(entity_type,entity_id,escalated_to,message) VALUES(?,?,?,?)')
      .run('task', task.id, escalatedTo, `Task "${task.title}" breached SLA.`);
    if (escalatedTo) {
      await notifyUsers(escalatedTo, `⚠️ SLA breached: Task "${task.title}" is overdue.`, 'danger', 'Tech Turf SLA Escalation');
    }
    escalations += 1;
  }

  res.json({ message: 'SLA check completed', escalations });
});

module.exports = router;
