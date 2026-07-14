const Database = require('better-sqlite3');
const dbPath = 'c:\\Users\\LOKESH\\OneDrive\\Desktop\\LOKESH\\Techturf\\TT_CRM_Update\\project\\techturf.db';
const db = new Database(dbPath);

try {
  console.log('Existing users:', db.prepare('SELECT id, name, role FROM users').all());

  const insertUser = db.prepare('INSERT INTO users (name, email, password, role, employment_status, is_active) VALUES (?, ?, ?, ?, ?, 1)');
  
  let alice = db.prepare("SELECT id FROM users WHERE name = 'Alice Green'").get();
  if (!alice) {
    const res = insertUser.run('Alice Green', 'alice@techturf.com', 'hashed', 'client_handler', 'active');
    alice = { id: res.lastInsertRowid };
  }
  
  let lead = db.prepare("SELECT id FROM users WHERE name = 'Lead Dernon'").get();
  if (!lead) {
    const res = insertUser.run('Lead Dernon', 'lead@techturf.com', 'hashed', 'team_leader', 'active');
    lead = { id: res.lastInsertRowid };
  }

  console.log('Alice ID:', alice.id, 'Lead ID:', lead.id);

  db.prepare('DELETE FROM projects WHERE client_id = 1').run();

  const insertProject = db.prepare('INSERT INTO projects (title, description, status, priority, progress_percent, deadline, team_leader_id, client_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  
  const p1 = insertProject.run(
    'Aero Dynamics Website Redesign',
    'Comprehensive overhaul of the main corporate website. Key focus on UI/UX modernization, mobile responsiveness, and integration with the new backend API. Goals: Increase user engagement by 30% and reduce load times.',
    'active',
    'urgent',
    75,
    '2026-12-31',
    lead.id,
    1, // Client ID
    1 // Created by
  );

  const p2 = insertProject.run(
    'Quantum Leap Marketing Campaign',
    'Global digital acquisition campaign spanning Google, YouTube, and Meta. Focuses on tech-savvy developers and enterprise decision makers.',
    'active',
    'normal',
    40,
    '2026-09-30',
    lead.id,
    1, // Client ID
    1 // Created by
  );

  console.log('Project 1 ID:', p1.lastInsertRowid, 'Project 2 ID:', p2.lastInsertRowid);

  db.prepare('DELETE FROM project_members WHERE project_id IN (?, ?)').run(p1.lastInsertRowid, p2.lastInsertRowid);
  
  const insertMember = db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)');
  insertMember.run(p1.lastInsertRowid, alice.id);
  insertMember.run(p1.lastInsertRowid, lead.id);
  insertMember.run(p2.lastInsertRowid, alice.id);

  const insertTask = db.prepare('INSERT INTO tasks (project_id, title, description, assigned_to, role_required, priority, deadline, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const t1 = insertTask.run(p1.lastInsertRowid, 'UI/UX Blueprint Design', 'Wireframe layouts and interactive prototypes.', alice.id, 'client_handler', 'urgent', '2026-07-15', 1);

  db.prepare('DELETE FROM submissions WHERE client_id = 1').run();
  const insertSubmission = db.prepare('INSERT INTO submissions (task_id, submitted_by, file_path, content_text, version, client_id, project_name, external_link, admin_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  
  insertSubmission.run(
    t1.lastInsertRowid,
    alice.id,
    '#',
    'Aero Dynamics Prototype Layouts Approved by Admin.',
    '1.0',
    1,
    'Aero Dynamics Website Redesign',
    'https://figma.com',
    'approved'
  );

  console.log('SEEDING SUCCESSFUL');
} catch (e) {
  console.error('Error during seeding:', e.message);
} finally {
  db.close();
}
