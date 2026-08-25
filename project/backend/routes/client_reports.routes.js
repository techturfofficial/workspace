const router = require('express').Router();
const db = require('../db');
const { verifyToken } = require('../auth');
const { notifyUsers } = require('../services/notification.service');
const { publish } = require('../services/realtime');

// Helper to check if user has admin/leader oversight
function canAccessClientData(user, clientId = null, projectId = null) {
  if (user.role === 'admin') return true;
  
  if (projectId) {
    const isLead = db.prepare(`
      SELECT 1 FROM projects p 
      LEFT JOIN project_members pm ON pm.project_id = p.id 
      WHERE p.id = ? AND (p.team_leader_id = ? OR pm.user_id = ?)
    `).get(projectId, user.id, user.id);
    if (isLead) return true;
  }

  if (clientId) {
    const isClientLead = db.prepare(`
      SELECT 1 FROM clients cl
      LEFT JOIN projects p ON p.client_id = cl.id
      LEFT JOIN project_members pm ON pm.project_id = p.id
      WHERE cl.id = ? AND (cl.team_leader_id = ? OR p.team_leader_id = ? OR pm.user_id = ?)
    `).get(clientId, user.id, user.id, user.id);
    if (isClientLead) return true;
  }

  return false;
}

// GET /api/client-reports/summary
router.get('/summary', verifyToken, (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';

    // Summary query scoped
    let reviewStats;
    let meetingStats;
    let deliverableStats;

    if (isAdmin) {
      reviewStats = db.prepare(`
        SELECT 
          COUNT(*) as total_reviews,
          AVG(rating) as avg_rating,
          SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as count_5,
          SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as count_4,
          SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as count_3,
          SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as count_2,
          SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as count_1
        FROM client_reviews
      `).get();

      meetingStats = db.prepare(`
        SELECT 
          COUNT(*) as total_meetings,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_syncs,
          SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_syncs,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_syncs
        FROM meetings
      `).get();

      deliverableStats = db.prepare(`
        SELECT COUNT(*) as total_deliverables
        FROM submissions 
        WHERE admin_status = 'approved' AND client_id IS NOT NULL
      `).get();
    } else {
      reviewStats = db.prepare(`
        SELECT 
          COUNT(cr.id) as total_reviews,
          AVG(cr.rating) as avg_rating,
          SUM(CASE WHEN cr.rating = 5 THEN 1 ELSE 0 END) as count_5,
          SUM(CASE WHEN cr.rating = 4 THEN 1 ELSE 0 END) as count_4,
          SUM(CASE WHEN cr.rating = 3 THEN 1 ELSE 0 END) as count_3,
          SUM(CASE WHEN cr.rating = 2 THEN 1 ELSE 0 END) as count_2,
          SUM(CASE WHEN cr.rating = 1 THEN 1 ELSE 0 END) as count_1
        FROM client_reviews cr
        JOIN projects p ON p.id = cr.project_id
        LEFT JOIN project_members pm ON pm.project_id = p.id
        WHERE p.team_leader_id = ? OR pm.user_id = ?
      `).get(req.user.id, req.user.id);

      meetingStats = db.prepare(`
        SELECT 
          COUNT(m.id) as total_meetings,
          SUM(CASE WHEN m.status = 'pending' THEN 1 ELSE 0 END) as pending_syncs,
          SUM(CASE WHEN m.status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_syncs,
          SUM(CASE WHEN m.status = 'completed' THEN 1 ELSE 0 END) as completed_syncs
        FROM meetings m
        WHERE m.team_leader_id = ?
      `).get(req.user.id);

      deliverableStats = db.prepare(`
        SELECT COUNT(s.id) as total_deliverables
        FROM submissions s
        JOIN tasks t ON t.id = s.task_id
        JOIN projects p ON p.id = t.project_id
        LEFT JOIN project_members pm ON pm.project_id = p.id
        WHERE s.admin_status = 'approved' AND (p.team_leader_id = ? OR pm.user_id = ?)
      `).get(req.user.id, req.user.id);
    }

    const avgRating = reviewStats?.avg_rating ? Number(reviewStats.avg_rating.toFixed(1)) : 5.0;
    const csatPercentage = Math.min(100, Math.round(avgRating * 20));

    res.json({
      avg_rating: avgRating,
      csat_score: csatPercentage,
      total_reviews: reviewStats?.total_reviews || 0,
      breakdown: {
        5: reviewStats?.count_5 || 0,
        4: reviewStats?.count_4 || 0,
        3: reviewStats?.count_3 || 0,
        2: reviewStats?.count_2 || 0,
        1: reviewStats?.count_1 || 0
      },
      pending_syncs: meetingStats?.pending_syncs || 0,
      confirmed_syncs: meetingStats?.confirmed_syncs || 0,
      total_syncs: meetingStats?.total_meetings || 0,
      total_deliverables: deliverableStats?.total_deliverables || 0
    });
  } catch (err) {
    console.error('Client report summary error:', err);
    res.status(500).json({ message: 'Failed to retrieve summary metrics' });
  }
});

// GET /api/client-reports/reviews
router.get('/reviews', verifyToken, (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const clientId = req.query.client_id ? Number(req.query.client_id) : null;
    const projectId = req.query.project_id ? Number(req.query.project_id) : null;
    const ratingFilter = req.query.rating ? Number(req.query.rating) : null;

    let query = `
      SELECT 
        cr.id, cr.project_id, cr.client_id, cr.rating, cr.feedback_text, cr.created_at,
        cl.name as client_name, cl.company as client_company, cl.email as client_email,
        p.title as project_title,
        u.name as leader_name, u.role as leader_role
      FROM client_reviews cr
      JOIN clients cl ON cl.id = cr.client_id
      JOIN projects p ON p.id = cr.project_id
      LEFT JOIN users u ON u.id = p.team_leader_id
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin) {
      query += ` AND (
        p.team_leader_id = ? 
        OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?)
      )`;
      params.push(req.user.id, req.user.id);
    }

    if (clientId) {
      query += ' AND cr.client_id = ?';
      params.push(clientId);
    }
    if (projectId) {
      query += ' AND cr.project_id = ?';
      params.push(projectId);
    }
    if (ratingFilter) {
      query += ' AND cr.rating = ?';
      params.push(ratingFilter);
    }

    query += ' ORDER BY cr.created_at DESC LIMIT 100';

    const reviews = db.prepare(query).all(...params);

    // Attach all assigned squad members for each project
    const memberStmt = db.prepare(`
      SELECT u.id, u.name, u.role, u.avatar 
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
    `);

    reviews.forEach(r => {
      r.assigned_members = r.project_id ? memberStmt.all(r.project_id) : [];
    });

    res.json(reviews);
  } catch (err) {
    console.error('Get reviews error:', err);
    res.status(500).json({ message: 'Failed to load client reviews' });
  }
});

// GET /api/client-reports/meetings
router.get('/meetings', verifyToken, (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const clientId = req.query.client_id ? Number(req.query.client_id) : null;
    const statusFilter = req.query.status ? String(req.query.status).trim() : null;

    let query = `
      SELECT 
        m.id, m.client_id, m.team_leader_id, m.title, m.description, m.scheduled_at, m.status, m.created_at,
        cl.name as client_name, cl.company as client_company, cl.email as client_email, cl.phone as client_phone,
        u.name as host_name, u.role as host_role, u.avatar as host_avatar
      FROM meetings m
      JOIN clients cl ON cl.id = m.client_id
      LEFT JOIN users u ON u.id = m.team_leader_id
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin) {
      query += ' AND (m.team_leader_id = ? OR cl.team_leader_id = ?)';
      params.push(req.user.id, req.user.id);
    }

    if (clientId) {
      query += ' AND m.client_id = ?';
      params.push(clientId);
    }
    if (statusFilter) {
      query += ' AND m.status = ?';
      params.push(statusFilter);
    }

    query += ' ORDER BY m.scheduled_at ASC, m.created_at DESC LIMIT 100';

    const meetings = db.prepare(query).all(...params);

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

      if (!meetingLink) {
        const urlMatch = desc.match(/(https?:\/\/[^\s]+(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com)[^\s]*)/i);
        if (urlMatch) meetingLink = urlMatch[1].trim();
      }

      m.meeting_link = meetingLink;
      m.host_notes = hostNotes;
      m.clean_description = desc;
    });

    res.json(meetings);
  } catch (err) {
    console.error('Get meetings error:', err);
    res.status(500).json({ message: 'Failed to load scheduled sync meetings' });
  }
});

// POST /api/client-reports/meetings - Staff proposes / schedules a meeting directly
router.post('/meetings', verifyToken, (req, res) => {
  const { client_id, title, description, scheduled_at, meeting_link, host_notes } = req.body;
  if (!client_id || !title || !scheduled_at) {
    return res.status(400).json({ message: 'Client ID, meeting title, and scheduled date/time are required' });
  }

  try {
    let finalDesc = description || '';
    if (meeting_link) finalDesc += `\n[Video Sync Link]: ${meeting_link}`;
    if (host_notes) finalDesc += `\n[Staff Note]: ${host_notes}`;
    finalDesc = finalDesc.trim();

    const leaderId = req.user.id;
    const result = db.prepare(`
      INSERT INTO meetings (client_id, team_leader_id, title, description, scheduled_at, status)
      VALUES (?, ?, ?, ?, ?, 'approved')
    `).run(Number(client_id), leaderId, title, finalDesc, scheduled_at);

    publish('meeting.update', {
      meetingId: result.lastInsertRowid,
      clientId: Number(client_id),
      status: 'approved',
      scheduled_at,
      meeting_link: meeting_link || null,
      updatedBy: req.user.name,
      at: new Date().toISOString()
    });

    res.json({ message: 'Meeting scheduled successfully with client', meetingId: result.lastInsertRowid });
  } catch (err) {
    console.error('Schedule meeting error:', err);
    res.status(500).json({ message: 'Failed to schedule meeting: ' + err.message });
  }
});

// PUT /api/client-reports/meetings/:id/status
router.put('/meetings/:id/status', verifyToken, (req, res) => {
  const meetingId = Number(req.params.id);
  const { status, scheduled_at, meeting_link, host_notes } = req.body;

  if (!status) {
    return res.status(400).json({ message: 'Status required' });
  }

  try {
    const meeting = db.prepare(`
      SELECT m.*, cl.name as client_name, cl.email as client_email 
      FROM meetings m 
      JOIN clients cl ON cl.id = m.client_id 
      WHERE m.id = ?
    `).get(meetingId);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && meeting.team_leader_id !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to update this meeting' });
    }

    let normalizedStatus = status.toLowerCase();
    if (normalizedStatus === 'confirmed' || normalizedStatus === 'completed') normalizedStatus = 'approved';
    if (normalizedStatus === 'rescheduled') normalizedStatus = 'pending';
    if (!['pending', 'approved', 'rejected', 'cancelled'].includes(normalizedStatus)) {
      normalizedStatus = 'approved';
    }

    let updateQuery = 'UPDATE meetings SET status = ?';
    const params = [normalizedStatus];

    if (scheduled_at) {
      updateQuery += ', scheduled_at = ?';
      params.push(scheduled_at);
    }

    if (descriptionUpdate(meeting.description, meeting_link, host_notes)) {
      updateQuery += ', description = ?';
      params.push(descriptionUpdate(meeting.description, meeting_link, host_notes));
    }

    updateQuery += ' WHERE id = ?';
    params.push(meetingId);

    db.prepare(updateQuery).run(...params);

    // Notify Client via Realtime Event + Staff Alert
    publish('meeting.update', {
      meetingId,
      clientId: meeting.client_id,
      status,
      scheduled_at: scheduled_at || meeting.scheduled_at,
      updatedBy: req.user.name,
      at: new Date().toISOString()
    });

    res.json({ message: `Meeting ${status} successfully` });
  } catch (err) {
    console.error('Update meeting status error:', err);
    res.status(500).json({ message: 'Failed to update meeting status' });
  }
});

function descriptionUpdate(existing = '', link, notes) {
  if (!link && !notes) return null;
  let text = existing || '';
  if (link) text += `\n[Video Sync Link]: ${link}`;
  if (notes) text += `\n[Staff Note]: ${notes}`;
  return text.trim();
}

module.exports = router;
