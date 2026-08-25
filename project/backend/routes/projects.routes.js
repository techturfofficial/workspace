const router = require('express').Router();
const db = require('../db');
const { verifyToken, checkRole } = require('../auth');
const { notifyUsers } = require('../services/notification.service');

// GET /api/projects
router.get('/', verifyToken, (req, res) => {
  const { status, search } = req.query;
  let query = `
    SELECT p.*, u.name as leader_name, c.name as client_name,
      (SELECT COUNT(*) FROM tasks WHERE project_id=p.id) as task_count,
      (SELECT COUNT(*) FROM tasks WHERE project_id=p.id AND status='approved') as completed_tasks
    FROM projects p
    LEFT JOIN users u ON u.id = p.team_leader_id
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { query += ' AND p.status=?'; params.push(status); }
  if (search) {
    query += ' AND (p.title LIKE ? OR COALESCE(p.description, "") LIKE ? OR COALESCE(c.name, "") LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY p.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// GET /api/projects/:id
router.get('/:id', verifyToken, (req, res) => {
  const p = db.prepare(`
    SELECT p.*, u.name as leader_name, c.name as client_name
    FROM projects p
    LEFT JOIN users u ON u.id=p.team_leader_id
    LEFT JOIN clients c ON c.id=p.client_id
    WHERE p.id=?
  `).get(req.params.id);
  if (!p) return res.status(404).json({ message: 'Not found' });

  const members = db.prepare(`
    SELECT u.id, u.name, u.role
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id=?
  `).all(req.params.id);
  p.team_members = members;

  res.json(p);
});

// GET /api/projects/:id/tasks
router.get('/:id/tasks', verifyToken, (req, res) => {
  const tasks = db.prepare(`
    SELECT t.*, u.name as assignee_name
    FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to
    WHERE t.project_id=? ORDER BY t.created_at ASC
  `).all(req.params.id);
  res.json(tasks);
});

// POST /api/projects - Only admin and team_leader can create projects
router.post('/', verifyToken, checkRole('admin', 'team_leader'), (req, res) => {
  const { title, description, priority, deadline, team_leader_id, client_id, team_members } = req.body;
  if (!title) return res.status(400).json({ message: 'Title required' });
  const effectiveLeaderId = team_leader_id ? Number(team_leader_id) : (req.user.role === 'team_leader' ? req.user.id : null);
  const result = db.prepare(
    'INSERT INTO projects(title,description,priority,deadline,team_leader_id,client_id,created_by) VALUES(?,?,?,?,?,?,?)'
  ).run(title, description, priority || 'normal', deadline, effectiveLeaderId, client_id ? Number(client_id) : null, req.user.id);

  let addedMemberIds = [];
  if (team_members && Array.isArray(team_members)) {
    const memStmt = db.prepare('INSERT INTO project_members(project_id, user_id) VALUES(?,?)');
    team_members.forEach(uid => { if (uid) { memStmt.run(result.lastInsertRowid, uid); addedMemberIds.push(uid); } });
  }

  if (effectiveLeaderId && effectiveLeaderId !== req.user.id) {
    notifyUsers(effectiveLeaderId, `📋 You've been assigned as Team Leader for project: "${title}"`, 'info', 'Tech Turf Project Assignment').catch(() => {});
  }

  // Notify all added project members (except the creator and team leader if already notified)
  const excludeIds = [req.user.id];
  if (effectiveLeaderId) excludeIds.push(effectiveLeaderId);
  const notifyMemberIds = addedMemberIds.filter(uid => !excludeIds.includes(uid));
  if (notifyMemberIds.length > 0) {
    notifyUsers(notifyMemberIds, `📋 You have been added to the project: "${title}"`, 'info', 'Tech Turf Project Assignment').catch(() => {});
  }

  res.json({ message: 'Project created', id: result.lastInsertRowid });
});

// PUT /api/projects/:id
router.put('/:id', verifyToken, checkRole('admin', 'team_leader', 'backend', 'frontend_backend'), (req, res) => {
  const { title, description, status, priority, deadline, team_leader_id, client_id, team_members } = req.body;
  const oldProj = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!oldProj) return res.status(404).json({ message: 'Project not found' });

  try {
    db.prepare(`UPDATE projects SET
      title=COALESCE(?,title), description=COALESCE(?,description),
      status=COALESCE(?,status), priority=COALESCE(?,priority),
      deadline=COALESCE(?,deadline), team_leader_id=COALESCE(?,team_leader_id),
      client_id=COALESCE(?,client_id) WHERE id=?
    `).run(
      title !== undefined ? title : null,
      description !== undefined ? description : null,
      status !== undefined ? status : null,
      priority !== undefined ? priority : null,
      deadline !== undefined ? deadline : null,
      team_leader_id !== undefined ? team_leader_id : null,
      client_id !== undefined ? client_id : null,
      req.params.id
    );

    if (team_members !== undefined && Array.isArray(team_members)) {
      db.prepare('DELETE FROM project_members WHERE project_id=?').run(req.params.id);
      const memStmt = db.prepare('INSERT INTO project_members(project_id, user_id) VALUES(?,?)');
      team_members.forEach(uid => { if (uid) memStmt.run(req.params.id, uid); });
    }

    // AUDIT LOG
    db.prepare('INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data) VALUES (?,?,?,?,?,?)')
      .run(req.user.id, 'UPDATE', 'projects', req.params.id, JSON.stringify(oldProj), JSON.stringify(req.body));
    res.json({ message: 'Project updated' });
  } catch (err) {
    console.error('Update Project Error:', err);
    res.status(500).json({ message: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id — cascade deletes all related data
router.post('/:id/archive', verifyToken, checkRole('admin'), (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  db.prepare("UPDATE projects SET status='archived', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
  res.json({ message: 'Project archived' });
});

router.post('/:id/restore', verifyToken, checkRole('admin'), (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  db.prepare("UPDATE projects SET status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
  res.json({ message: 'Project restored' });
});

router.post('/bulk-status', verifyToken, checkRole('admin'), (req, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0 || !status) {
    return res.status(400).json({ message: 'ids array and status required' });
  }

  const validStatuses = ['active', 'paused', 'completed', 'archived'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE projects SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id IN (${placeholders})`)
    .run(status, ...ids);
  res.json({ message: 'Projects updated' });
});

router.delete('/:id', verifyToken, checkRole('admin'), (req, res) => {
  const projectId = req.params.id;

  // Verify project exists first
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
  if (!project) return res.status(404).json({ message: 'Project not found' });

  try {
    // AUDIT LOG (Nexus Project Snapshot)
    db.prepare('INSERT INTO audit_log (user_id, action, table_name, record_id, old_data) VALUES (?,?,?,?,?)')
      .run(req.user.id, 'DELETE', 'projects', projectId, JSON.stringify(project));

    // Run full cascade delete in a transaction
    const cascadeDelete = db.transaction(() => {
      // 1. Delete submissions linked to tasks of this project
      db.prepare(`
        DELETE FROM submissions WHERE task_id IN (
          SELECT id FROM tasks WHERE project_id=?
        )
      `).run(projectId);

      // 2. Delete task_members linked to tasks of this project
      db.prepare(`
        DELETE FROM task_members WHERE task_id IN (
          SELECT id FROM tasks WHERE project_id=?
        )
      `).run(projectId);

      // 3. Delete meeting notes linked to tasks of this project
      db.prepare(`
        DELETE FROM meeting_notes WHERE task_id IN (
          SELECT id FROM tasks WHERE project_id=?
        )
      `).run(projectId);

      // 4. Clear task dependency self-references
      db.prepare('UPDATE tasks SET depends_on=NULL WHERE project_id=?').run(projectId);

      // 5. Delete all tasks in this project
      db.prepare('DELETE FROM tasks WHERE project_id=?').run(projectId);

      // 6. Delete project members assigned to this project
      db.prepare('DELETE FROM project_members WHERE project_id=?').run(projectId);

      // 7. Delete performance log entries for this project
      db.prepare('DELETE FROM performance_log WHERE project_id=?').run(projectId);

      // 8. Delete whiteboards linked to this project
      db.prepare('DELETE FROM whiteboards WHERE project_id=?').run(projectId);

      // 9. Delete meeting notes linked directly to this project
      db.prepare('DELETE FROM meeting_notes WHERE project_id=?').run(projectId);

      // 10. Delete client reviews linked to this project
      db.prepare('DELETE FROM client_reviews WHERE project_id=?').run(projectId);

      // 11. Delete asset library entries linked to this project
      db.prepare('DELETE FROM asset_library WHERE project_id=?').run(projectId);

      // 12. Delete project conversations, participants, and chat messages
      const projectConvs = db.prepare('SELECT id FROM conversations WHERE project_id=?').all(projectId);
      for (const conv of projectConvs) {
        db.prepare('DELETE FROM chat_messages WHERE conversation_id=?').run(conv.id);
        db.prepare('DELETE FROM conversation_participants WHERE conversation_id=?').run(conv.id);
        db.prepare('DELETE FROM conversations WHERE id=?').run(conv.id);
      }

      // 13. Delete project-related notifications (cleanup)
      db.prepare(`DELETE FROM notifications WHERE message LIKE ?`).run(`%"${project.title}"%`);

      // 14. Finally delete the project itself
      db.prepare('DELETE FROM projects WHERE id=?').run(projectId);
    });

    cascadeDelete();
    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    console.error('Delete Project Error:', err);
    res.status(500).json({ message: 'Failed to delete project: ' + err.message });
  }
});

module.exports = router;
