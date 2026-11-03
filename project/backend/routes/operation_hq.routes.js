const router = require('express').Router();
const db     = require('../db');
const { verifyToken, checkRole } = require('../auth');

router.post('/nexus-forecasting', verifyToken, checkRole('admin','team_leader'), (req, res) => {
  const { project_id } = req.body;
  if (!project_id) return res.status(400).json({ message: 'Project ID required' });

  const tasks = db.prepare('SELECT status FROM tasks WHERE project_id=?').all(project_id);
  const completed = tasks.filter(t => t.status === 'approved').length;
  const total = tasks.length;
  const progressPercent = total > 0 ? (completed / total) * 100 : 0;
  const remaining = Math.max(0, total - completed);
  const completionForecast = total === 0
    ? 'Not enough data yet.'
    : remaining === 0
      ? 'Project is complete.'
      : `${Math.max(1, Math.ceil((100 - progressPercent) / 12))} days remaining.`;
  
  res.json({
    project_id,
    completionForecast,
    confidenceIndex: total === 0 ? 0 : Math.min(99, Math.max(35, Math.round(50 + progressPercent / 2))),
    progressPercent,
    recommendation: remaining > 0
      ? 'Consider redistributing pending tasks to reduce delivery time.'
      : 'All project tasks are complete.'
  });
});

router.post('/blitz-assign', verifyToken, checkRole('admin','team_leader'), (req, res) => {
  const { project_id, users_count } = req.body;
  if (!project_id) return res.status(400).json({ message: 'Project ID required' });

  const tasks = db.prepare('SELECT id FROM tasks WHERE project_id=? AND assigned_to IS NULL').all(project_id);
  const users = db.prepare("SELECT id FROM users WHERE role NOT IN ('admin', 'client_handler') AND is_active = 1 LIMIT ?").all(users_count || 3);

  if (users.length === 0) {
    return res.status(400).json({ message: 'No eligible users available for assignment.' });
  }
  
  let assignedCount = 0;
  tasks.forEach((t, i) => {
    if (users[i % users.length]) {
       db.prepare("UPDATE tasks SET assigned_to=?, status='in_progress' WHERE id=?").run(users[i % users.length].id, t.id);
       assignedCount++;
    }
  });

  res.json({ message: `Blitz Assign completed: ${assignedCount} tasks distributed.`, assignedCount });
});

module.exports = router;
