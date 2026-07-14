const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();
const dbPath = process.env.DB_PATH || path.join(__dirname, '../storage/techturf.db');
const db = new Database(dbPath);

try {
  // 1. Delete all existing data from operational tables
  const tablesToClear = [
    'submissions', 'task_members', 'tasks', 'project_members', 'projects',
    'chat_messages', 'conversation_participants', 'conversations',
    'tickets', 'payments', 'client_interactions', 'portal_access', 'clients'
  ];

  db.exec('PRAGMA foreign_keys = OFF'); // Temporarily disable FK checks to easily truncate
  for (const table of tablesToClear) {
    db.prepare(`DELETE FROM ${table}`).run();
    // Optional: reset sqlite_sequence if we want IDs to start from 1
    db.prepare(`DELETE FROM sqlite_sequence WHERE name='${table}'`).run();
  }
  db.exec('PRAGMA foreign_keys = ON');
  
  console.log('Cleared all existing sample data from operational tables.');

  // Ensure Admin and Team Leader exist
  const insertUser = db.prepare('INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, ?, 1)');
  
  let admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!admin) {
    const res = insertUser.run('Admin User', 'admin@techturf.com', 'hashed', 'admin');
    admin = { id: res.lastInsertRowid };
  }

  let leader = db.prepare("SELECT id FROM users WHERE role = 'team_leader' LIMIT 1").get();
  if (!leader) {
    const res = insertUser.run('Team Leader', 'leader@techturf.com', 'hashed', 'team_leader');
    leader = { id: res.lastInsertRowid };
  }

  // 2. Insert 2 New Sample Clients
  const insertClient = db.prepare(`
    INSERT INTO clients (name, company, email, client_login_id, password_hash, is_active, team_leader_id) 
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);
  
  const client1 = insertClient.run('Acme Corp', 'Acme Corporation', 'contact@acme.com', 'acme_login', 'hashed', leader.id);
  const client2 = insertClient.run('Globex Inc', 'Globex Incorporated', 'hello@globex.com', 'globex_login', 'hashed', leader.id);

  console.log(`Inserted 2 New Clients: Acme Corp (ID: ${client1.lastInsertRowid}), Globex Inc (ID: ${client2.lastInsertRowid})`);

  // 3. Insert Projects for these clients
  const insertProject = db.prepare(`
    INSERT INTO projects (title, description, status, priority, client_id, team_leader_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const p1 = insertProject.run('Acme E-Commerce Platform', 'Building a new online storefront for Acme.', 'active', 'urgent', client1.lastInsertRowid, leader.id, admin.id);
  const p2 = insertProject.run('Globex Cloud Migration', 'Migrating Globex infrastructure to AWS.', 'active', 'normal', client2.lastInsertRowid, leader.id, admin.id);

  console.log(`Inserted 2 New Projects.`);

  // 4. Insert some tasks
  const insertTask = db.prepare(`
    INSERT INTO tasks (project_id, title, description, assigned_to, role_required, status, priority, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertTask.run(p1.lastInsertRowid, 'Design System Architecture', 'Create the initial database schema and API design.', leader.id, 'backend', 'in_progress', 'urgent', admin.id);
  insertTask.run(p2.lastInsertRowid, 'Audit Existing Infrastructure', 'Document current servers and networks.', leader.id, 'backend', 'pending', 'normal', admin.id);

  console.log('Inserted New Tasks. Seeding complete!');

} catch (err) {
  console.error('Error seeding data:', err);
} finally {
  db.close();
}
