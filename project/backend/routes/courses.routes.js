const router = require('express').Router();
const db = require('../db');
const { verifyToken, userHasRole } = require('../auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const coursesUploadDir = path.join(__dirname, '../../storage/uploads/courses');
if (!fs.existsSync(coursesUploadDir)) fs.mkdirSync(coursesUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, coursesUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    const safeBase = path.basename(file.originalname || 'course-video').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '');
    cb(null, `${Date.now()}_${safeBase}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

function normalizeVideoPath(file) {
  if (!file) return '';
  return `/uploads/courses/${file.filename}`;
}

// List all courses (optionally filter by team/user/project)
router.get('/', verifyToken, (req, res) => {
  const { team, user, project } = req.query;
  let sql = 'SELECT * FROM courses WHERE 1=1';
  const params = [];
  if (team) { sql += " AND (access_team IS NULL OR access_team = ? OR access_team = '')"; params.push(team); }
  if (user) { sql += " AND (access_user IS NULL OR access_user = ? OR access_user = '')"; params.push(user); }
  if (project) { sql += " AND (access_project IS NULL OR access_project = ? OR access_project = '')"; params.push(project); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Add a new course
router.post('/', verifyToken, (req, res) => {
  const handleCreate = (req, res) => {
    const { title, description, link, video_url, access_team, access_user, access_project } = req.body;
    const video_file = normalizeVideoPath(req.file);
    if (!title) return res.status(400).json({ message: 'Course title is required' });
    const created_by = req.user?.id || 1;
    const stmt = db.prepare('INSERT INTO courses (title, description, link, video_url, video_file, created_by, access_team, access_user, access_project) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(title, description || '', link || '', video_url || '', video_file, created_by, access_team || '', access_user || '', access_project || '');
    res.json({ id: info.lastInsertRowid });
  };

  upload.single('video_file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    handleCreate(req, res);
  });
});

// Delete a course
router.delete('/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  const course = db.prepare('SELECT id, created_by FROM courses WHERE id=?').get(id);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  if (!userHasRole(req.user, 'admin') && Number(course.created_by) !== Number(req.user.id)) {
    return res.status(403).json({ message: 'Only an admin or the course author can delete this course' });
  }
  db.prepare('DELETE FROM courses WHERE id=?').run(id);
  res.json({ success: true });
});

module.exports = router;
