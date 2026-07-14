/**
 * seed_demo.js — Comprehensive, idempotent seed script for Tech Turf CRM.
 * 
 * Populates: users, clients, projects, tasks, submissions, payments,
 * conversations (client + internal), chat messages, tickets, notifications, announcements.
 *
 * Safe to re-run: uses INSERT OR IGNORE / existence checks throughout.
 * Run from /project: node backend/seed_demo.js
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '../storage/techturf.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// ─── Helpers ────────────────────────────────────────────────────────

function hashSync(pw) { return bcrypt.hashSync(pw, 12); }

function upsertUser(name, email, password, role, extras = {}) {
  let user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (user) return user.id;
  const stmt = db.prepare(`
    INSERT INTO users (name, email, password, role, is_active, employment_status, department, bio)
    VALUES (?, ?, ?, ?, 1, 'active', ?, ?)
  `);
  const info = stmt.run(name, email, hashSync(password), role, extras.department || null, extras.bio || null);
  return Number(info.lastInsertRowid);
}

function upsertClient(name, company, email, loginId, password, teamLeaderId) {
  let client = db.prepare('SELECT id FROM clients WHERE client_login_id = ?').get(loginId);
  if (client) return client.id;
  const stmt = db.prepare(`
    INSERT INTO clients (name, company, email, client_login_id, password_hash, is_active, team_leader_id, stage)
    VALUES (?, ?, ?, ?, ?, 1, ?, 'active')
  `);
  const info = stmt.run(name, company, email, loginId, hashSync(password), teamLeaderId);
  return Number(info.lastInsertRowid);
}

function insertProject(title, desc, status, priority, clientId, leaderId, adminId, deadline, progress) {
  const existing = db.prepare('SELECT id FROM projects WHERE title = ? AND client_id = ?').get(title, clientId);
  if (existing) return existing.id;
  const stmt = db.prepare(`
    INSERT INTO projects (title, description, status, priority, client_id, team_leader_id, created_by, deadline, progress_percent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return Number(stmt.run(title, desc, status, priority, clientId, leaderId, adminId, deadline, progress).lastInsertRowid);
}

function insertTask(projectId, title, desc, assignedTo, roleReq, status, priority, createdBy, deadline) {
  const existing = db.prepare('SELECT id FROM tasks WHERE title = ? AND project_id = ?').get(title, projectId);
  if (existing) return existing.id;
  const stmt = db.prepare(`
    INSERT INTO tasks (project_id, title, description, assigned_to, role_required, status, priority, created_by, deadline)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return Number(stmt.run(projectId, title, desc, assignedTo, roleReq, status, priority, createdBy, deadline).lastInsertRowid);
}

function insertSubmission(taskId, submittedBy, contentText, version, clientId, projectName, leaderStatus, adminStatus) {
  const existing = db.prepare('SELECT id FROM submissions WHERE task_id = ? AND version = ?').get(taskId, version);
  if (existing) return existing.id;
  const stmt = db.prepare(`
    INSERT INTO submissions (task_id, submitted_by, content_text, version, client_id, project_name, leader_status, admin_status, file_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '#')
  `);
  return Number(stmt.run(taskId, submittedBy, contentText, version, clientId, projectName, leaderStatus, adminStatus).lastInsertRowid);
}

function insertPayment(clientId, amount, currency, date, method, status, desc, source, createdBy) {
  const existing = db.prepare('SELECT id FROM payments WHERE client_id = ? AND amount = ? AND description = ?').get(clientId, amount, desc);
  if (existing) return existing.id;
  const stmt = db.prepare(`
    INSERT INTO payments (client_id, amount, currency, payment_date, method, status, description, source, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return Number(stmt.run(clientId, amount, currency, date, method, status, desc, source, createdBy).lastInsertRowid);
}

function getOrCreateConversation(title, clientId, participantUserIds) {
  let convo;
  if (clientId) {
    convo = db.prepare('SELECT id FROM conversations WHERE client_id = ? LIMIT 1').get(clientId);
  } else {
    convo = db.prepare('SELECT id FROM conversations WHERE title = ? AND client_id IS NULL LIMIT 1').get(title);
  }
  if (convo) return convo.id;
  const isGroup = participantUserIds.length > 2 || !!title ? 1 : 0;
  const result = db.prepare('INSERT INTO conversations (title, is_group, client_id) VALUES (?, ?, ?)').run(title, isGroup, clientId || null);
  const convId = Number(result.lastInsertRowid);
  const insert = db.prepare('INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)');
  participantUserIds.forEach(uid => insert.run(convId, uid));
  return convId;
}

function insertChatMessage(conversationId, senderUserId, senderClientId, message, minutesAgo) {
  const ts = new Date(Date.now() - minutesAgo * 60000).toISOString().replace('T', ' ').slice(0, 19);
  const existing = db.prepare('SELECT id FROM chat_messages WHERE conversation_id = ? AND message = ?').get(conversationId, message);
  if (existing) return existing.id;
  const stmt = db.prepare(`
    INSERT INTO chat_messages (conversation_id, sender_id, sender_client_id, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  return Number(stmt.run(conversationId, senderUserId || null, senderClientId || null, message, ts).lastInsertRowid);
}

// ─── Main Seed ──────────────────────────────────────────────────────

try {
  console.log('🌱 Starting comprehensive seed...');

  // ═══ 1. STAFF USERS ═══════════════════════════════════════════════
  const adminId    = upsertUser('Admin',         'admin@techturf.com',    'Password123!', 'admin',         { department: 'Management', bio: 'System administrator' });
  const leaderId   = upsertUser('Ravi Kumar',    'ravi@techturf.com',     'Password123!', 'team_leader',   { department: 'Engineering', bio: 'Team lead for web projects' });
  const designerId = upsertUser('Priya Sharma',  'priya@techturf.com',    'Password123!', 'designer',      { department: 'Design', bio: 'Senior UI/UX designer' });
  const writerId   = upsertUser('Arjun Mehta',   'arjun@techturf.com',    'Password123!', 'writer',        { department: 'Content', bio: 'Content strategy and copywriting' });
  const devId      = upsertUser('Neha Patel',    'neha@techturf.com',     'Password123!', 'frontend_backend', { department: 'Engineering', bio: 'Full-stack developer' });
  console.log(`  ✓ Users: admin=${adminId}, leader=${leaderId}, designer=${designerId}, writer=${writerId}, dev=${devId}`);

  // ═══ 2. CLIENTS ═══════════════════════════════════════════════════
  const client1 = upsertClient('Vikram Singh',   'AeroDyne Technologies', 'vikram@aerodyne.in',  'aerodyne_login', 'ClientPass1!', leaderId);
  const client2 = upsertClient('Sara Johnson',   'Nexus Digital Studio',  'sara@nexusdigi.com',  'nexus_login',    'ClientPass1!', leaderId);
  const client3 = upsertClient('Rahul Verma',    'QuantumLeap Analytics', 'rahul@quantumleap.io','quantum_login',  'ClientPass1!', leaderId);
  const client4 = upsertClient('Anita Das',      'BrightEdge Marketing', 'anita@brightedge.co', 'brightedge_login','ClientPass1!', leaderId);
  console.log(`  ✓ Clients: ${client1}, ${client2}, ${client3}, ${client4}`);

  // ═══ 3. PROJECTS ═══════════════════════════════════════════════════

  // Client 1 — AeroDyne
  const p1a = insertProject('AeroDyne Corporate Website',   'Full redesign of the corporate website with modern UI.', 'active', 'urgent',  client1, leaderId, adminId, '2026-09-30', 65);
  const p1b = insertProject('AeroDyne Mobile App',          'React Native app for drone fleet management.',           'active', 'normal',  client1, leaderId, adminId, '2026-12-15', 30);
  const p1c = insertProject('AeroDyne Brand Refresh',       'Complete brand identity overhaul.',                       'completed', 'low', client1, leaderId, adminId, '2026-04-01', 100);

  // Client 2 — Nexus Digital
  const p2a = insertProject('Nexus Portfolio Platform',     'Interactive portfolio showcase with 3D elements.',        'active', 'urgent',  client2, leaderId, adminId, '2026-08-20', 45);
  const p2b = insertProject('Nexus SEO Campaign',           'Content-driven SEO strategy for organic growth.',         'active', 'normal',  client2, leaderId, adminId, '2026-10-31', 20);

  // Client 3 — QuantumLeap
  const p3a = insertProject('QuantumLeap Dashboard',        'Real-time analytics dashboard with chart.js.',            'active', 'urgent',  client3, leaderId, adminId, '2026-11-01', 55);
  const p3b = insertProject('QuantumLeap API Integration',  'REST API gateway for 3rd party data feeds.',              'paused', 'normal',  client3, leaderId, adminId, '2027-01-15', 10);

  // Client 4 — BrightEdge
  const p4a = insertProject('BrightEdge Social Campaign',   'Multi-platform social media marketing campaign.',         'active', 'normal',  client4, leaderId, adminId, '2026-09-15', 70);
  const p4b = insertProject('BrightEdge Landing Pages',     'High-conversion landing pages for lead gen.',             'active', 'urgent',  client4, leaderId, adminId, '2026-08-01', 50);
  const p4c = insertProject('BrightEdge Analytics Setup',   'GA4 and Tag Manager implementation.',                     'completed', 'low', client4, leaderId, adminId, '2026-05-10', 100);

  console.log('  ✓ Projects seeded');

  // ═══ 3b. PROJECT MEMBERS ═══════════════════════════════════════════
  const addMember = db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)');
  [p1a,p1b,p1c].forEach(pid => { addMember.run(pid, devId); addMember.run(pid, designerId); });
  [p2a,p2b].forEach(pid => { addMember.run(pid, designerId); addMember.run(pid, writerId); });
  [p3a,p3b].forEach(pid => { addMember.run(pid, devId); });
  [p4a,p4b,p4c].forEach(pid => { addMember.run(pid, writerId); addMember.run(pid, designerId); });
  console.log('  ✓ Project members assigned');

  // ═══ 4. TASKS ═════════════════════════════════════════════════════
  // AeroDyne Corporate Website (p1a)
  const t1  = insertTask(p1a, 'Design Homepage Mockup',       'Create high-fidelity homepage design.',       designerId, 'designer',   'approved', 'urgent',  adminId, '2026-07-15');
  const t2  = insertTask(p1a, 'Implement Responsive Layout',  'Build responsive CSS grid system.',           devId,      'frontend',   'in_progress','urgent', adminId, '2026-07-25');
  const t3  = insertTask(p1a, 'Write Homepage Copy',          'Craft compelling headline and body copy.',    writerId,   'writer',     'submitted', 'normal', adminId, '2026-07-20');
  const t4  = insertTask(p1a, 'Backend API Setup',            'Setup Express routes and DB models.',         devId,      'backend',    'approved',  'urgent', adminId, '2026-07-10');
  const t5  = insertTask(p1a, 'SEO Metadata Integration',     'Add meta tags and structured data.',          writerId,   'writer',     'pending',   'normal', adminId, '2026-08-01');
  const t6  = insertTask(p1a, 'User Testing Round 1',         'Conduct usability tests with stakeholders.',  designerId, 'designer',   'pending',   'low',    adminId, '2026-08-15');

  // AeroDyne Mobile App (p1b)
  const t7  = insertTask(p1b, 'App Architecture Design',      'Define RN project structure and navigation.', devId,      'frontend',   'in_progress','normal', adminId, '2026-08-01');
  const t8  = insertTask(p1b, 'Fleet Dashboard Screen',       'UI for real-time drone fleet status.',         designerId, 'designer',   'pending',   'urgent', adminId, '2026-09-01');
  const t9  = insertTask(p1b, 'Push Notification Service',    'Setup Firebase Cloud Messaging.',             devId,      'backend',    'pending',   'normal', adminId, '2026-09-15');
  const t10 = insertTask(p1b, 'API Client Integration',       'Connect app to AeroDyne REST API.',           devId,      'backend',    'pending',   'normal', adminId, '2026-10-01');
  const t11 = insertTask(p1b, 'App Store Submission Prep',    'Screenshots, descriptions, app listing.',     writerId,   'writer',     'pending',   'low',    adminId, '2026-11-15');

  // Nexus Portfolio (p2a)
  const t12 = insertTask(p2a, '3D Portfolio Renderer',        'Three.js interactive project showcase.',      devId,      'frontend',   'in_progress','urgent', adminId, '2026-07-20');
  const t13 = insertTask(p2a, 'Case Study Templates',         'Design reusable case study page layouts.',    designerId, 'designer',   'submitted', 'normal', adminId, '2026-07-25');
  const t14 = insertTask(p2a, 'Portfolio Content Writing',    'Write case studies for 8 portfolio items.',   writerId,   'writer',     'in_progress','normal', adminId, '2026-08-05');
  const t15 = insertTask(p2a, 'Contact Form + CRM Link',     'Build contact form with HubSpot webhook.',    devId,      'backend',    'pending',   'normal', adminId, '2026-08-10');
  const t16 = insertTask(p2a, 'Performance Optimization',    'Lighthouse audit and optimization.',          devId,      'frontend',   'pending',   'low',    adminId, '2026-08-15');

  // QuantumLeap Dashboard (p3a)
  const t17 = insertTask(p3a, 'Dashboard Layout Design',     'Wireframes for analytics dashboard.',         designerId, 'designer',   'approved',  'urgent', adminId, '2026-07-10');
  const t18 = insertTask(p3a, 'Chart.js Integration',        'Build bar, line, pie charts with real data.', devId,      'frontend',   'in_progress','urgent', adminId, '2026-08-01');
  const t19 = insertTask(p3a, 'Real-time Data Streaming',    'WebSocket feed for live metrics.',            devId,      'backend',    'pending',   'normal', adminId, '2026-09-01');
  const t20 = insertTask(p3a, 'Export to PDF/CSV',           'Generate downloadable reports.',              devId,      'backend',    'pending',   'normal', adminId, '2026-09-15');
  const t21 = insertTask(p3a, 'Dashboard Documentation',     'User guide for dashboard features.',          writerId,   'writer',     'pending',   'low',    adminId, '2026-10-01');

  // BrightEdge Social Campaign (p4a)
  const t22 = insertTask(p4a, 'Campaign Creative Assets',    'Design 20 ad creatives for social media.',   designerId, 'designer',   'approved',  'urgent', adminId, '2026-07-05');
  const t23 = insertTask(p4a, 'Ad Copy Variations',          'Write A/B test copies for each platform.',   writerId,   'writer',     'approved',  'normal', adminId, '2026-07-10');
  const t24 = insertTask(p4a, 'Campaign Scheduling',         'Schedule posts across all platforms.',         writerId,   'writer',     'in_progress','normal', adminId, '2026-07-20');

  // BrightEdge Landing Pages (p4b)
  const t25 = insertTask(p4b, 'Landing Page Design',         'Design 3 high-conversion landing pages.',     designerId, 'designer',   'submitted', 'urgent', adminId, '2026-07-15');
  const t26 = insertTask(p4b, 'Landing Page Development',    'Build responsive pages with forms.',          devId,      'frontend',   'in_progress','urgent', adminId, '2026-07-25');
  const t27 = insertTask(p4b, 'A/B Test Setup',              'Configure split testing with GA4.',           devId,      'backend',    'pending',   'normal', adminId, '2026-08-01');

  console.log('  ✓ Tasks seeded');

  // ═══ 5. SUBMISSIONS ═══════════════════════════════════════════════
  insertSubmission(t1,  designerId, 'Homepage mockup v1 — full-width hero with gradient overlays.', 1, client1, 'AeroDyne Corporate Website', 'approved', 'approved');
  insertSubmission(t4,  devId,      'Express API scaffolding complete with auth, routes, and DB layer.', 1, client1, 'AeroDyne Corporate Website', 'approved', 'approved');
  insertSubmission(t3,  writerId,   'Draft homepage copy — "Elevating Drone Technology".', 1, client1, 'AeroDyne Corporate Website', 'pending', 'pending');
  insertSubmission(t13, designerId, 'Case study template design v1 — minimalist card layout.', 1, client2, 'Nexus Portfolio Platform', 'pending', 'pending');
  insertSubmission(t17, designerId, 'Dashboard wireframes approved by client.', 1, client3, 'QuantumLeap Dashboard', 'approved', 'approved');
  insertSubmission(t22, designerId, 'Social media creative assets batch 1 (10/20 completed).', 1, client4, 'BrightEdge Social Campaign', 'approved', 'approved');
  insertSubmission(t23, writerId,   'Ad copy A/B variants for Meta and Google Ads.', 1, client4, 'BrightEdge Social Campaign', 'approved', 'approved');
  insertSubmission(t25, designerId, 'Landing page designs — 3 variants submitted for review.', 1, client4, 'BrightEdge Landing Pages', 'pending', 'pending');
  insertSubmission(t2,  devId,      'Responsive grid v1 — works on mobile, tablet, desktop.', 1, client1, 'AeroDyne Corporate Website', 'rework', 'pending');
  console.log('  ✓ Submissions seeded');

  // ═══ 6. PAYMENTS ═════════════════════════════════════════════════
  // AeroDyne — mix of paid, pending, overdue
  insertPayment(client1, 150000, 'INR', '2026-05-15', 'Bank Transfer', 'paid',    'AeroDyne Website — Phase 1 payment',       'employee_portal', adminId);
  insertPayment(client1, 100000, 'INR', '2026-06-20', 'UPI',           'paid',    'AeroDyne Website — Phase 2 payment',       'employee_portal', adminId);
  insertPayment(client1, 75000,  'INR', null,          'Bank Transfer', 'pending', 'AeroDyne Mobile App — Advance payment',    'employee_portal', adminId);
  insertPayment(client1, 50000,  'INR', '2026-04-01', 'Card',          'paid',    'AeroDyne Brand Refresh — Final payment',   'employee_portal', adminId);

  // Nexus Digital — paid + pending
  insertPayment(client2, 80000,  'INR', '2026-06-01', 'UPI',           'paid',    'Nexus Portfolio — Initial deposit',        'employee_portal', adminId);
  insertPayment(client2, 60000,  'INR', null,          'Bank Transfer', 'pending', 'Nexus Portfolio — Milestone 2 due',        'employee_portal', adminId);
  insertPayment(client2, 25000,  'INR', '2026-05-10', 'UPI',           'paid',    'Nexus SEO Campaign — Monthly retainer',    'employee_portal', adminId);

  // QuantumLeap — overdue + pending
  insertPayment(client3, 200000, 'INR', '2026-04-15', 'Bank Transfer', 'paid',    'QuantumLeap Dashboard — Phase 1',          'employee_portal', adminId);
  insertPayment(client3, 120000, 'INR', '2026-06-01', 'Bank Transfer', 'overdue', 'QuantumLeap Dashboard — Phase 2 overdue',  'employee_portal', adminId);
  insertPayment(client3, 50000,  'INR', null,          'UPI',           'pending', 'QuantumLeap API Integration — Advance',    'employee_portal', adminId);

  // BrightEdge — paid + pending
  insertPayment(client4, 45000,  'INR', '2026-06-10', 'Card',          'paid',    'BrightEdge Social Campaign — Month 1',     'employee_portal', adminId);
  insertPayment(client4, 45000,  'INR', null,          'Card',          'pending', 'BrightEdge Social Campaign — Month 2',     'employee_portal', adminId);
  insertPayment(client4, 35000,  'INR', '2026-05-20', 'UPI',           'paid',    'BrightEdge Landing Pages — Initial',       'employee_portal', adminId);
  insertPayment(client4, 35000,  'INR', null,          'Bank Transfer', 'pending', 'BrightEdge Landing Pages — Final',         'employee_portal', adminId);
  insertPayment(client4, 15000,  'INR', '2026-03-15', 'UPI',           'paid',    'BrightEdge Analytics Setup — One-time',    'employee_portal', adminId);
  console.log('  ✓ Payments seeded');

  // ═══ 7. MESSAGING ═════════════════════════════════════════════════

  // Client-linked threads (one per client, with back-and-forth)
  const conv1 = getOrCreateConversation('Client Chat Thread', client1, [adminId, leaderId, devId, designerId]);
  insertChatMessage(conv1, null, client1, 'Hi team! When can I expect the homepage mockup for review?', 120);
  insertChatMessage(conv1, leaderId, null, 'Hi Vikram! The mockup is almost ready — Priya is polishing the final details. You should have it by end of day.', 100);
  insertChatMessage(conv1, null, client1, 'That sounds great. Looking forward to it!', 90);
  insertChatMessage(conv1, designerId, null, 'Hi Vikram, I have shared the homepage design in the workspace. Please review and share your feedback.', 45);

  const conv2 = getOrCreateConversation('Client Chat Thread', client2, [adminId, leaderId, designerId, writerId]);
  insertChatMessage(conv2, null, client2, 'Hello! I wanted to check on the portfolio platform progress.', 200);
  insertChatMessage(conv2, leaderId, null, 'Hi Sara! The 3D renderer is about 60% done. We are on track for the August deadline.', 180);
  insertChatMessage(conv2, null, client2, 'Perfect. Can we also add a video section to each case study?', 160);
  insertChatMessage(conv2, designerId, null, 'Great idea Sara! I will update the case study template to include a video embed section.', 140);

  const conv3 = getOrCreateConversation('Client Chat Thread', client3, [adminId, leaderId, devId]);
  insertChatMessage(conv3, null, client3, 'The dashboard demo looked great! One question about the real-time data refresh rate.', 300);
  insertChatMessage(conv3, devId, null, 'Thanks Rahul! Currently it refreshes every 5 seconds via WebSocket. We can make this configurable.', 280);
  insertChatMessage(conv3, null, client3, 'That would be helpful. Also, could we add an export-to-PDF feature?', 250);

  const conv4 = getOrCreateConversation('Client Chat Thread', client4, [adminId, leaderId, writerId, designerId]);
  insertChatMessage(conv4, null, client4, 'Hi, the social media creatives look amazing! Can we add our updated brand colors?', 150);
  insertChatMessage(conv4, designerId, null, 'Absolutely Anita! I will update the palette and send revised assets tomorrow.', 130);
  insertChatMessage(conv4, null, client4, 'Thank you so much!', 120);

  // Internal staff-only thread (must NOT be visible to any client)
  const internalConv = getOrCreateConversation('Team Standup Chat', null, [adminId, leaderId, devId, designerId, writerId]);
  insertChatMessage(internalConv, adminId,    null, 'Good morning team! Quick standup — any blockers?', 60);
  insertChatMessage(internalConv, devId,      null, 'No blockers from my side. AeroDyne responsive layout is progressing well.', 55);
  insertChatMessage(internalConv, designerId, null, 'Working on BrightEdge creatives revision. Should be done today.', 50);
  insertChatMessage(internalConv, writerId,   null, 'Finishing the Nexus portfolio case studies. Need photos from the design team.', 45);
  insertChatMessage(internalConv, leaderId,   null, 'Great updates everyone. Let us sync again tomorrow at 10 AM.', 40);
  console.log('  ✓ Conversations and messages seeded');

  // ═══ 8. TICKETS ═══════════════════════════════════════════════════
  const insertTicket = db.prepare(`
    INSERT OR IGNORE INTO tickets (title, description, status, priority, category, client_id, assigned_to, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);
  insertTicket.run('Website loads slowly on mobile',   'The homepage takes 8+ seconds on 4G.', 'open',        'urgent', 'Performance', client1, devId,      '-2 days');
  insertTicket.run('Logo appears blurry on retina',    'Need a 2x resolution version of logo.', 'in_progress', 'normal', 'Design',      client1, designerId, '-5 days');
  insertTicket.run('Portfolio page 404 on click',      'Clicking case study 3 gives a 404.',   'open',        'urgent', 'Bug',         client2, devId,      '-1 days');
  insertTicket.run('Dashboard chart labels overlap',   'On small screens the X axis is unreadable.', 'resolved', 'normal', 'Bug',      client3, devId,      '-10 days');
  insertTicket.run('Need updated brand guidelines doc','Please share the latest brand PDF.',    'open',        'low',    'General Support', client4, writerId, '-3 days');
  console.log('  ✓ Tickets seeded');

  // ═══ 9. NOTIFICATIONS ═════════════════════════════════════════════
  const insertNotif = db.prepare(`
    INSERT OR IGNORE INTO notifications (user_id, message, type, created_at)
    VALUES (?, ?, ?, datetime('now', ?))
  `);
  insertNotif.run(adminId,    'New payment received from AeroDyne Technologies — ₹1,50,000', 'success', '-1 days');
  insertNotif.run(leaderId,   'Task "Design Homepage Mockup" has been approved.',             'success', '-2 days');
  insertNotif.run(devId,      'You have been assigned a new task: "Push Notification Service"', 'info',  '-1 days');
  insertNotif.run(designerId, 'Client BrightEdge requested brand color update.',                'warning','-3 hours');
  insertNotif.run(writerId,   'Deadline approaching: "Portfolio Content Writing" due Aug 5.',    'warning','-6 hours');
  insertNotif.run(adminId,    'Monthly revenue report is ready for review.',                    'info',   '-12 hours');
  console.log('  ✓ Notifications seeded');

  // ═══ 10. ANNOUNCEMENTS ════════════════════════════════════════════
  const insertAnn = db.prepare(`
    INSERT OR IGNORE INTO announcements (title, body, priority, created_by, pinned, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', ?))
  `);
  insertAnn.run('Q3 Sprint Planning',     'All teams please submit sprint goals by Friday EOD. Check the project board for updated priorities.', 'normal', adminId, 1, '-2 days');
  insertAnn.run('Server Maintenance',     'Scheduled maintenance window: July 5th, 2 AM – 4 AM IST. Expect brief downtime.',                   'urgent', adminId, 0, '-1 days');
  insertAnn.run('New Design System Live', 'The updated design system v2.0 is now live. All new projects should use the new component library.',  'normal', designerId, 0, '-5 days');
  console.log('  ✓ Announcements seeded');

  console.log('\n✅ Comprehensive seed complete!');
  console.log('\n📋 Login Credentials:');
  console.log('  Employee Portal (Port 3000):');
  console.log('    admin@techturf.com / Password123!');
  console.log('    ravi@techturf.com  / Password123!');
  console.log('  Client Portal (Port 5000):');
  console.log('    aerodyne_login  / ClientPass1!');
  console.log('    nexus_login     / ClientPass1!');
  console.log('    quantum_login   / ClientPass1!');
  console.log('    brightedge_login / ClientPass1!');

} catch (err) {
  console.error('❌ Seed error:', err);
  process.exit(1);
} finally {
  db.close();
}
