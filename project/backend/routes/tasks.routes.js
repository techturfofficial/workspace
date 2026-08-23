const router = require('express').Router();
const db = require('../db');
const { verifyToken, checkRole } = require('../auth');
const { notifyUsers } = require('../services/notification.service');

// GET /api/tasks
router.get('/', verifyToken, (req, res) => {
  const { project_id, status, assigned_to, priority, search } = req.query;
  let query = `
    SELECT t.*, u.name as assignee_name, p.title as project_title,
      (
        SELECT GROUP_CONCAT(u2.name, ', ')
        FROM task_members tm JOIN users u2 ON u2.id = tm.user_id
        WHERE tm.task_id = t.id
      ) as member_names,
      (
        SELECT GROUP_CONCAT(tm2.user_id)
        FROM task_members tm2
        WHERE tm2.task_id = t.id
      ) as member_ids
    FROM tasks t
    LEFT JOIN users u ON u.id=t.assigned_to
    LEFT JOIN projects p ON p.id=t.project_id
    WHERE 1=1
  `;
  const params = [];
  if (project_id) { query += ' AND t.project_id=?'; params.push(project_id); }
  if (status) {
    if (status.includes(',')) {
      const statuses = status.split(',').map(s => s.trim());
      query += ` AND t.status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    } else {
      query += ' AND t.status=?';
      params.push(status);
    }
  }
  if (assigned_to) { query += ' AND t.assigned_to=?'; params.push(assigned_to); }
  if (priority) { query += ' AND t.priority=?'; params.push(priority); }
  if (search) {
    query += ' AND (t.title LIKE ? OR COALESCE(t.description, "") LIKE ? OR COALESCE(p.title, "") LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += " ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.deadline ASC";
  const rows = db.prepare(query).all(...params);
  // Parse member_ids into an array for convenience
  rows.forEach(r => {
    r.member_ids = r.member_ids ? r.member_ids.split(',').map(Number) : [];
  });
  res.json(rows);
});

// GET /api/tasks/:id
router.get('/:id', verifyToken, (req, res) => {
  const task = db.prepare(`
    SELECT t.*, u.name as assignee_name, p.title as project_title
    FROM tasks t
    LEFT JOIN users u ON u.id=t.assigned_to
    LEFT JOIN projects p ON p.id=t.project_id
    WHERE t.id=?
  `).get(req.params.id);
  if (!task) return res.status(404).json({ message: 'Not found' });

  // Fetch all assigned members
  task.task_members = db.prepare(`
    SELECT u.id, u.name, u.role
    FROM task_members tm JOIN users u ON u.id = tm.user_id
    WHERE tm.task_id = ?
  `).all(req.params.id);

  res.json(task);
});

// POST /api/tasks
router.post('/', verifyToken, checkRole('admin', 'team_leader', 'frontend_backend', 'production'), (req, res) => {
  const { project_id, title, description, assigned_to, role_required, priority, deadline, depends_on, max_revisions, task_members } = req.body;
  if (!project_id || !title) return res.status(400).json({ message: 'project_id and title required' });

  // Intelligent Role Fallback: Detect role from assignee if not specified
  let targetRole = role_required;
  if (!targetRole && assigned_to) {
    const user = db.prepare('SELECT role FROM users WHERE id=?').get(assigned_to);
    if (user) targetRole = user.role;
  }

  let effectiveProjectId = null;
  let clientId = null;
  if (typeof project_id === 'string' && project_id.startsWith('client_')) {
    clientId = parseInt(project_id.replace('client_', ''));
  } else if (!isNaN(Number(project_id))) {
    const existingProj = db.prepare('SELECT id FROM projects WHERE id=?').get(Number(project_id));
    if (existingProj) {
      effectiveProjectId = existingProj.id;
    } else {
      const existingClient = db.prepare('SELECT id FROM clients WHERE id=?').get(Number(project_id));
      if (existingClient) clientId = existingClient.id;
    }
  }

  if (clientId) {
    let proj = db.prepare('SELECT id FROM projects WHERE client_id=? ORDER BY id DESC LIMIT 1').get(clientId);
    if (!proj) {
      const client = db.prepare('SELECT name FROM clients WHERE id=?').get(clientId);
      const projTitle = client ? `${client.name}'s Project` : 'Client Project';
      const newProj = db.prepare('INSERT INTO projects (title, client_id, created_by) VALUES (?, ?, ?)').run(projTitle, clientId, req.user.id);
      effectiveProjectId = newProj.lastInsertRowid;
    } else {
      effectiveProjectId = proj.id;
    }
  }

  if (!effectiveProjectId) {
    let fallbackProj = db.prepare('SELECT id FROM projects ORDER BY id ASC LIMIT 1').get();
    if (!fallbackProj) {
      const newProj = db.prepare('INSERT INTO projects (title, created_by) VALUES (?, ?)').run('General Project', req.user.id);
      effectiveProjectId = newProj.lastInsertRowid;
    } else {
      effectiveProjectId = fallbackProj.id;
    }
  }

  // Determine primary assignee: first in task_members list or explicit assigned_to
  const memberIds = Array.isArray(task_members) ? task_members.filter(Boolean).map(Number) : [];
  const rawAssignee = assigned_to || memberIds[0] || null;
  let primaryAssignee = null;
  if (rawAssignee) {
    const u = db.prepare('SELECT id FROM users WHERE id=?').get(Number(rawAssignee));
    if (u) primaryAssignee = u.id;
  }

  let validDependsOn = null;
  if (depends_on) {
    const dep = db.prepare('SELECT id FROM tasks WHERE id=?').get(Number(depends_on));
    if (dep) validDependsOn = dep.id;
  }

  try {
    const result = db.prepare(`
      INSERT INTO tasks(project_id,title,description,assigned_to,role_required,priority,deadline,depends_on,max_revisions,created_by)
      VALUES(?,?,?,?,?,?,?,?,?,?)
    `).run(
      effectiveProjectId,
      title,
      description || null,
      primaryAssignee,
      targetRole || null,
      priority || 'normal',
      deadline || null,
      validDependsOn,
      max_revisions || 3,
      req.user.id
    );

    const taskId = result.lastInsertRowid;

    // Insert task_members (safely verifying each user_id exists in users table)
    if (memberIds.length > 0) {
      const memStmt = db.prepare('INSERT OR IGNORE INTO task_members(task_id, user_id) VALUES(?,?)');
      memberIds.forEach(uid => {
        const u = db.prepare('SELECT id FROM users WHERE id=?').get(uid);
        if (u) memStmt.run(taskId, u.id);
      });
    }

    // AUDIT LOG (Nexus Integrity Record)
    db.prepare('INSERT INTO audit_log (user_id, action, table_name, record_id, new_data) VALUES (?,?,?,?,?)')
      .run(req.user.id, 'INSERT', 'tasks', taskId, JSON.stringify(req.body));

    // Notify all members
    const notifyIds = memberIds.length > 0 ? [...new Set(memberIds)] : (primaryAssignee ? [primaryAssignee] : []);
    notifyUsers(notifyIds, `📌 New task assigned to you: "${title}"`, 'info', 'Tech Turf Task Assignment').catch(() => {});

    res.json({ message: 'Task created', id: taskId });
  } catch (err) {
    console.error('Task Creation Error:', err);
    res.status(500).json({ message: 'Failed to initiate task protocol: ' + err.message });
  }
});

// PUT /api/tasks/:id
router.put('/:id', verifyToken, checkRole('admin', 'team_leader', 'backend', 'frontend_backend', 'production'), (req, res) => {
  const { title, description, assigned_to, status, priority, deadline, max_revisions, role_required, task_members } = req.body;
  const oldTask = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!oldTask) return res.status(404).json({ message: 'Task not found' });

  // Determine effective primary assignee
  const memberIds = Array.isArray(task_members) ? task_members.filter(Boolean).map(Number) : undefined;
  const primaryAssignee = assigned_to !== undefined ? assigned_to
    : (memberIds && memberIds.length > 0 ? memberIds[0] : undefined);

  try {
    db.prepare(`UPDATE tasks SET
      title=COALESCE(?,title), description=COALESCE(?,description),
      assigned_to=COALESCE(?,assigned_to), status=COALESCE(?,status),
      priority=COALESCE(?,priority), deadline=COALESCE(?,deadline),
      max_revisions=COALESCE(?,max_revisions), role_required=COALESCE(?,role_required) WHERE id=?
    `).run(
      title !== undefined ? title : null,
      description !== undefined ? description : null,
      primaryAssignee !== undefined ? primaryAssignee : null,
      status !== undefined ? status : null,
      priority !== undefined ? priority : null,
      deadline !== undefined ? deadline : null,
      max_revisions !== undefined ? max_revisions : null,
      role_required !== undefined ? role_required : null,
      req.params.id
    );

    // Sync task_members if provided
    if (memberIds !== undefined) {
      const prevIds = db.prepare('SELECT user_id FROM task_members WHERE task_id=?').all(req.params.id).map(r => r.user_id);
      db.prepare('DELETE FROM task_members WHERE task_id=?').run(req.params.id);
      const memStmt = db.prepare('INSERT OR IGNORE INTO task_members(task_id, user_id) VALUES(?,?)');
      memberIds.forEach(uid => memStmt.run(req.params.id, uid));

      // Notify newly added members
      const newIds = memberIds.filter(uid => !prevIds.includes(uid));
      notifyUsers(newIds, `📌 You've been added to task: "${oldTask.title}"`, 'info', 'Tech Turf Task Assignment Update').catch(() => {});
    }

    // AUDIT LOG (Warp Snapshot)
    db.prepare('INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data) VALUES (?,?,?,?,?,?)')
      .run(req.user.id, 'UPDATE', 'tasks', req.params.id, JSON.stringify(oldTask), JSON.stringify(req.body));
    res.json({ message: 'Task updated' });
  } catch (err) {
    console.error('Update Task Error:', err);
    res.status(500).json({ message: 'Failed to update task' });
  }
});

// POST /api/tasks/:id/rework
router.post('/:id/rework', verifyToken, checkRole('admin', 'team_leader'), (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).json({ message: 'Not found' });
  if (task.revision_count >= task.max_revisions) {
    return res.status(400).json({ message: `Max revisions (${task.max_revisions}) reached. Escalate to Admin.` });
  }
  db.prepare("UPDATE tasks SET status='rework', revision_count=revision_count+1 WHERE id=?").run(task.id);
  notifyUsers(task.assigned_to, `🔄 Task "${task.title}" sent back for rework (${task.revision_count + 1}/${task.max_revisions})`, 'warning', 'Tech Turf Task Rework').catch(() => {});

  if (task.revision_count + 1 >= task.max_revisions) {
    const admin = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
    if (admin) notifyUsers(admin.id, `⚠️ FINAL revision for task "${task.title}" — review urgently`, 'danger', 'Tech Turf Escalation Alert').catch(() => {});
  }
  res.json({ message: 'Sent for rework' });
});

router.post('/bulk-action', verifyToken, checkRole('admin', 'team_leader'), (req, res) => {
  const { ids, status, assigned_to, archive } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'ids array required' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const updates = [];
  const params = [];

  if (status !== undefined) { updates.push('status=?'); params.push(status); }
  if (assigned_to !== undefined) { updates.push('assigned_to=?'); params.push(assigned_to || null); }
  if (archive === true) { updates.push("status='rejected'"); }
  if (updates.length === 0) return res.status(400).json({ message: 'No bulk updates provided' });

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id IN (${placeholders})`).run(...params, ...ids);
  res.json({ message: 'Bulk task update completed' });
});

// PUT /api/tasks/:id/start
router.put('/:id/start', verifyToken, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id=? AND assigned_to=?').get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ message: 'Not found or not assigned to you' });
  db.prepare("UPDATE tasks SET status='in_progress' WHERE id=?").run(task.id);
  res.json({ message: 'Task started' });
});

// DELETE /api/tasks/:id
router.delete('/:id', verifyToken, checkRole('admin'), (req, res) => {
  const oldTask = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!oldTask) return res.status(404).json({ message: 'Task not found' });

  try {
    db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);

    // AUDIT LOG (Nexus Relic Snapshot)
    db.prepare('INSERT INTO audit_log (user_id, action, table_name, record_id, old_data) VALUES (?,?,?,?,?)')
      .run(req.user.id, 'DELETE', 'tasks', req.params.id, JSON.stringify(oldTask));

    res.json({ message: 'Task deleted successfully (Historic snapshot saved to Warp)' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete task' });
  }
});

module.exports = router;
