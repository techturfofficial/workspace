const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const BUILTIN_ROLE_NAMES = [
  'admin', 'team_leader', 'rnd', 'writer',
  'designer', 'media_manager', 'creator', 'client_handler',
  'frontend', 'backend', 'frontend_backend', 'production'
];
const USER_ROLE_CHECK_VALUES = BUILTIN_ROLE_NAMES.map(role => `'${role}'`).join(',');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../storage/techturf.db');
const db = new Database(dbPath);
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN (${USER_ROLE_CHECK_VALUES})),
  secondary_roles TEXT,
  avatar TEXT,
  badge TEXT DEFAULT NULL,
  points INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- LOGIN LOG
CREATE TABLE IF NOT EXISTS login_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  ip TEXT,
  user_agent TEXT,
  login_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CLIENTS
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  phone_alt TEXT,
  email TEXT,
  location TEXT,
  comm_method TEXT,
  industry TEXT,
  business_desc TEXT,
  audience TEXT,
  competitors TEXT,
  brand_assets TEXT,
  service_type TEXT,
  project_desc TEXT,
  project_goals TEXT,
  features TEXT,
  design_prefs TEXT,
  reference_examples TEXT,
  platform TEXT,
  tech TEXT,
  integrations TEXT,
  hosting TEXT,
  budget TEXT,
  timeline TEXT,
  urgency TEXT,
  content TEXT,
  media TEXT,
  guidelines TEXT,
  credentials TEXT,
  agreement TEXT,
  payment_terms TEXT,
  ownership TEXT,
  nda TEXT,
  maintenance TEXT,
  updates TEXT,
  marketing TEXT,
  team_leader_id INTEGER REFERENCES users(id),
  team_members TEXT,
  brand_colors TEXT,
  brand_tone TEXT,
  goals TEXT,
  portal_password TEXT,
  satisfaction_score REAL DEFAULT 0,
  retainer_mode INTEGER DEFAULT 0,
  project_key TEXT,
  stage TEXT DEFAULT 'new_register',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- PROJECTS
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','completed','archived')),
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('urgent','normal','low')),
  team_leader_id INTEGER REFERENCES users(id),
  client_id INTEGER REFERENCES clients(id),
  deadline DATE,
  created_by INTEGER REFERENCES users(id),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- PROJECT MEMBERS MAP
CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

-- TASKS
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to INTEGER REFERENCES users(id),
  role_required TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN (
    'pending','in_progress','submitted','approved','rejected','rework'
  )),
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('urgent','normal','low')),
  depends_on INTEGER REFERENCES tasks(id),
  deadline DATE,
  revision_count INTEGER DEFAULT 0,
  max_revisions INTEGER DEFAULT 3,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TASK MEMBERS (multi-assignee)
CREATE TABLE IF NOT EXISTS task_members (
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_members_task_id ON task_members(task_id);
CREATE INDEX IF NOT EXISTS idx_task_members_user_id ON task_members(user_id);

-- SUBMISSIONS
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id),
  submitted_by INTEGER REFERENCES users(id),
  file_path TEXT,
  content_text TEXT,
  client_id INTEGER REFERENCES clients(id),
  project_name TEXT,
  version INTEGER DEFAULT 1,
  nexus_score INTEGER,
  nexus_feedback TEXT,
  nexus_status TEXT CHECK(nexus_status IN ('approved','improve','rejected')),
  leader_status TEXT DEFAULT 'pending' CHECK(leader_status IN ('approved','rejected','rework','pending')),
  admin_status TEXT DEFAULT 'pending' CHECK(admin_status IN ('approved','rejected','rework','pending')),

  admin_override TEXT,
  external_link TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- PORTAL ACCESS (FOR CLIENT CONNECT)
CREATE TABLE IF NOT EXISTS portal_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id),
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CLIENT INTERACTIONS
CREATE TABLE IF NOT EXISTS client_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id),
  handler_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL, -- Call, Meeting, Email, Project Update
  notes TEXT,
  sentiment TEXT, -- Positive, Neutral, Negative
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portal_access_token ON portal_access(token);
CREATE INDEX IF NOT EXISTS idx_interactions_client ON client_interactions(client_id);

-- PERFORMANCE LOG
CREATE TABLE IF NOT EXISTS performance_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  project_id INTEGER,
  task_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK(type IN ('info','warning','success','danger')),
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- COMPANY ROLES
CREATE TABLE IF NOT EXISTS company_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#4f46e5',
  is_system INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TEAMS
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  leader_id INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

-- MESSAGING
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  is_group INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id),
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);

-- SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL, -- INSERT, UPDATE, DELETE, ROLLBACK
  table_name TEXT,
  record_id INTEGER,
  old_data TEXT, -- JSON snapshot before action
  new_data TEXT, -- JSON snapshot after action
  details TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- LEARNING HUB (COURSES)
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  link TEXT NOT NULL,
  video_url TEXT,
  video_file TEXT,
  created_by INTEGER REFERENCES users(id),
  access_team TEXT,
  access_user TEXT,
  access_project TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  payment_date DATE,
  method TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TICKETS (HELPDESK)
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed')),
  created_by INTEGER REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('urgent','normal','low')),
  category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_login_log_user_id ON login_log(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_team_leader_id ON projects(team_leader_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_submissions_task_id ON submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by ON submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
`);

db.pragma('foreign_keys = ON');

db.exec(`
-- DRIVE SYSTEM
CREATE TABLE IF NOT EXISTS drive_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('file','folder')),
  parent_id INTEGER REFERENCES drive_items(id) ON DELETE CASCADE,
  mime_type TEXT,
  file_size INTEGER,
  file_path TEXT, -- Relative path inside drive_storage/
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drive_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER REFERENCES drive_items(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  access_level TEXT DEFAULT 'viewer' CHECK(access_level IN ('viewer','editor')),
  UNIQUE(item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_drive_items_parent ON drive_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_drive_access_user ON drive_access(user_id);

-- ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('urgent','normal','low')),
  created_by INTEGER REFERENCES users(id),
  pinned INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON announcements(created_by);

-- DESIGN VAULT
CREATE TABLE IF NOT EXISTS asset_library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  tags TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asset_library_project_id ON asset_library(project_id);
CREATE INDEX IF NOT EXISTS idx_asset_library_uploaded_by ON asset_library(uploaded_by);

-- CREATIVE WORKSPACE (WHITEBOARDS)
CREATE TABLE IF NOT EXISTS whiteboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'UNTITLED',
  content_json TEXT,
  last_preview_base64 TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_whiteboards_created_by ON whiteboards(created_by);
CREATE INDEX IF NOT EXISTS idx_whiteboards_project_id ON whiteboards(project_id);

-- R&D LAB
CREATE TABLE IF NOT EXISTS knowledge_base (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  category TEXT,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  tags TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_author_id ON knowledge_base(author_id);

CREATE TABLE IF NOT EXISTS lab_experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  results TEXT,
  status TEXT DEFAULT 'running' CHECK(status IN ('running','success','failed','paused')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lab_experiments_owner_id ON lab_experiments(owner_id);

-- BROADCAST HUB
CREATE TABLE IF NOT EXISTS media_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  schedule_at DATETIME NOT NULL,
  status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','published','failed','draft')),
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_media_posts_schedule_at ON media_posts(schedule_at);
CREATE INDEX IF NOT EXISTS idx_media_posts_author_id ON media_posts(author_id);

-- CREATOR SLATE
CREATE TABLE IF NOT EXISTS production_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  start_at DATETIME NOT NULL,
  end_at DATETIME,
  location TEXT,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_production_events_assigned_to ON production_events(assigned_to);
CREATE INDEX IF NOT EXISTS idx_production_events_start_at ON production_events(start_at);

CREATE TABLE IF NOT EXISTS gear_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  condition TEXT DEFAULT 'good',
  status TEXT DEFAULT 'available' CHECK(status IN ('available','in_use','broken')),
  last_used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gear_inventory_last_used_by ON gear_inventory(last_used_by);

-- CLIENT CONNECT
CREATE TABLE IF NOT EXISTS portal_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_portal_access_client_id ON portal_access(client_id);
CREATE INDEX IF NOT EXISTS idx_portal_access_expires_at ON portal_access(expires_at);
`);

// Backfill profile fields for older databases.
const userColumns = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userColumns.includes('mobile')) {
  db.exec('ALTER TABLE users ADD COLUMN mobile TEXT');
}
if (!userColumns.includes('github_link')) {
  db.exec('ALTER TABLE users ADD COLUMN github_link TEXT');
}
if (!userColumns.includes('bio')) {
  db.exec('ALTER TABLE users ADD COLUMN bio TEXT');
}
if (!userColumns.includes('department')) {
  db.exec('ALTER TABLE users ADD COLUMN department TEXT');
}
if (!userColumns.includes('branch')) {
  db.exec('ALTER TABLE users ADD COLUMN branch TEXT');
}
if (!userColumns.includes('site')) {
  db.exec('ALTER TABLE users ADD COLUMN site TEXT');
}
if (!userColumns.includes('employment_status')) {
  db.exec("ALTER TABLE users ADD COLUMN employment_status TEXT DEFAULT 'active'");
}
if (!userColumns.includes('offboarding_note')) {
  db.exec('ALTER TABLE users ADD COLUMN offboarding_note TEXT');
}

const submissionColumns = db.prepare('PRAGMA table_info(submissions)').all().map(c => c.name);
if (!submissionColumns.includes('admin_status')) {
  db.exec("ALTER TABLE submissions ADD COLUMN admin_status TEXT DEFAULT 'pending'");
}

const courseColumns = db.prepare('PRAGMA table_info(courses)').all().map(c => c.name);
if (!courseColumns.includes('video_url')) {
  db.exec('ALTER TABLE courses ADD COLUMN video_url TEXT');
}
if (!courseColumns.includes('video_file')) {
  db.exec('ALTER TABLE courses ADD COLUMN video_file TEXT');
}

// Keep primary role CHECK constraint synced when role list expands.
const usersTableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() || {}).sql || '';
const missingPrimaryRoles = BUILTIN_ROLE_NAMES.filter(role => !usersTableSql.includes(`'${role}'`));
if (missingPrimaryRoles.length) {
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN (${USER_ROLE_CHECK_VALUES})),
        secondary_roles TEXT,
        avatar TEXT,
        badge TEXT DEFAULT NULL,
        points INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        mobile TEXT,
        github_link TEXT,
        bio TEXT,
        department TEXT,
        branch TEXT,
        site TEXT,
        employment_status TEXT DEFAULT 'active',
        offboarding_note TEXT
      );
      INSERT INTO users_new (
        id, name, email, password, role, secondary_roles, avatar, badge, points, is_active,
        created_at, mobile, github_link, bio, department, branch, site, employment_status, offboarding_note
      )
      SELECT
        id, name, email, password, role, secondary_roles, avatar, badge, points, is_active,
        created_at, mobile, github_link, bio, department, branch, site, COALESCE(employment_status, 'active'), offboarding_note
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  name TEXT,
  department TEXT,
  role TEXT,
  secondary_roles TEXT,
  branch TEXT,
  site TEXT,
  team_id INTEGER REFERENCES teams(id),
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME,
  status TEXT DEFAULT 'pending',
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);

CREATE TABLE IF NOT EXISTS role_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  department TEXT,
  primary_role TEXT,
  secondary_roles TEXT,
  description TEXT,
  is_default INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
  key TEXT PRIMARY KEY,
  category TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_template_permissions (
  template_id INTEGER REFERENCES role_templates(id) ON DELETE CASCADE,
  permission_key TEXT REFERENCES permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (template_id, permission_key)
);

CREATE TABLE IF NOT EXISTS access_scopes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  scope_type TEXT DEFAULT 'global',
  branch TEXT,
  site TEXT,
  team_id INTEGER REFERENCES teams(id),
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_access_scopes_user_id ON access_scopes(user_id);

CREATE TABLE IF NOT EXISTS password_reset_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  otp TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user ON password_reset_otps(user_id, purpose);

CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  jti TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);

CREATE TABLE IF NOT EXISTS chat_message_reads (
  message_id INTEGER REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER REFERENCES chat_messages(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  pinned INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_inbox_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_inbox_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER REFERENCES team_inbox_threads(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id),
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT,
  team_id INTEGER REFERENCES teams(id),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'normal',
  sla_hours INTEGER DEFAULT 24,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recurring_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER REFERENCES task_templates(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL,
  next_run_at DATETIME NOT NULL,
  last_run_at DATETIME,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sla_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  target_hours INTEGER NOT NULL,
  warning_hours INTEGER DEFAULT 4,
  team_id INTEGER REFERENCES teams(id),
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS escalation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  escalated_to INTEGER REFERENCES users(id),
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meeting_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  started_at DATETIME NOT NULL,
  ended_at DATETIME,
  duration_minutes INTEGER,
  source TEXT DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  target_value REAL,
  current_value REAL DEFAULT 0,
  due_date DATE,
  status TEXT DEFAULT 'active',
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cycle_name TEXT,
  self_review TEXT,
  manager_review TEXT,
  status TEXT DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skill_matrix (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  skill TEXT,
  level INTEGER DEFAULT 1,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, skill)
);

CREATE TABLE IF NOT EXISTS help_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  role_scope TEXT,
  language TEXT DEFAULT 'en',
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  is_completed INTEGER DEFAULT 0,
  walkthrough_version TEXT DEFAULT 'v1',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  page TEXT,
  category TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS policies (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload TEXT,
  status TEXT DEFAULT 'pending',
  run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS policy_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  references_json TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

const roleSeedStmt = db.prepare(`
  INSERT OR IGNORE INTO company_roles (name, description, color, is_system)
  VALUES (?, ?, ?, 1)
`);
[
  ['admin', 'System administrator role', '#ef4444'],
  ['team_leader', 'Leads projects and teams', '#f59e0b'],
  ['rnd', 'Research and development', '#22c55e'],
  ['writer', 'Content writing role', '#3b82f6'],
  ['designer', 'Design and visual work', '#a855f7'],
  ['media_manager', 'Media planning and publishing', '#ec4899'],
  ['creator', 'Creator and production role', '#14b8a6'],
  ['client_handler', 'Client communication and support', '#f97316'],
  ['frontend', 'Frontend engineering role', '#0ea5e9'],
  ['backend', 'Backend engineering role', '#10b981'],
  ['frontend_backend', 'Full-stack engineering role', '#6366f1'],
  ['production', 'Production operations role', '#f59e0b']
].forEach(([name, description, color]) => roleSeedStmt.run(name, description, color));

const permissionSeedStmt = db.prepare('INSERT OR IGNORE INTO permissions (key, category, description) VALUES (?,?,?)');
[
  ['dashboard.view', 'dashboard', 'View dashboard and summary cards'],
  ['tasks.view', 'tasks', 'View tasks'],
  ['tasks.create', 'tasks', 'Create tasks'],
  ['tasks.edit', 'tasks', 'Edit tasks'],
  ['tasks.approve', 'tasks', 'Approve/reject submissions'],
  ['tasks.bulk', 'tasks', 'Bulk update/archive tasks'],
  ['projects.view', 'projects', 'View projects'],
  ['projects.create', 'projects', 'Create projects'],
  ['projects.edit', 'projects', 'Edit projects'],
  ['projects.archive', 'projects', 'Archive/restore projects'],
  ['users.view', 'users', 'View users'],
  ['users.edit', 'users', 'Edit user profiles/roles'],
  ['users.lifecycle', 'users', 'Manage probation/suspension/offboarding'],
  ['invites.manage', 'governance', 'Create and manage invitations'],
  ['teams.manage', 'teams', 'Create and manage teams'],
  ['chat.send', 'chat', 'Send direct/group messages'],
  ['announcements.manage', 'announcements', 'Publish company and team announcements'],
  ['submissions.review', 'submissions', 'Review project submissions'],
  ['policies.manage', 'admin', 'Update policy center'],
  ['reports.view', 'analytics', 'View monitoring and reports']
].forEach(([key, category, description]) => permissionSeedStmt.run(key, category, description));

const roleTemplateSeedStmt = db.prepare(`
  INSERT OR IGNORE INTO role_templates (name, department, primary_role, secondary_roles, description, is_default)
  VALUES (?, ?, ?, ?, ?, 1)
`);
[
  ['content_team_default', 'Content', 'writer', 'creator', 'Default content department template'],
  ['design_team_default', 'Design', 'designer', 'creator', 'Default design department template'],
  ['client_ops_default', 'Client', 'client_handler', 'team_leader', 'Default client operations template'],
  ['operations_default', 'Operations', 'team_leader', 'media_manager,creator', 'Default operations template']
].forEach(([name, department, primary_role, secondary_roles, description]) => {
  roleTemplateSeedStmt.run(name, department, primary_role, secondary_roles, description);
});

// Backfill client fields for older databases.
const clientColumns = db.prepare('PRAGMA table_info(clients)').all().map(c => c.name);
if (!clientColumns.includes('stage')) {
  db.exec("ALTER TABLE clients ADD COLUMN stage TEXT DEFAULT 'new_register'");
}

// ──────────────────────────────────────────────────────────────────────
// PORTAL INTEGRATION MIGRATIONS — Payments & Messaging unification
// These idempotent ALTERs add columns required to link Employee Portal
// and Client Connect Portal to the same underlying data tables.
// ──────────────────────────────────────────────────────────────────────

// --- Payments: add client_id, status, description, source ---
const paymentColumns = db.prepare('PRAGMA table_info(payments)').all().map(c => c.name);
if (!paymentColumns.includes('client_id')) {
  db.exec('ALTER TABLE payments ADD COLUMN client_id INTEGER REFERENCES clients(id)');
}
if (!paymentColumns.includes('status')) {
  db.exec("ALTER TABLE payments ADD COLUMN status TEXT DEFAULT 'pending'");
}
if (!paymentColumns.includes('description')) {
  db.exec('ALTER TABLE payments ADD COLUMN description TEXT');
}
if (!paymentColumns.includes('source')) {
  db.exec("ALTER TABLE payments ADD COLUMN source TEXT DEFAULT 'employee_portal'");
}
db.exec('CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id)');

// --- Conversations: add client_id for client-staff thread tagging ---
const conversationColumns = db.prepare('PRAGMA table_info(conversations)').all().map(c => c.name);
if (!conversationColumns.includes('client_id')) {
  db.exec('ALTER TABLE conversations ADD COLUMN client_id INTEGER REFERENCES clients(id)');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON conversations(client_id)');

// --- Chat messages: add sender_client_id to identify client-originated messages ---
const chatMessageColumns = db.prepare('PRAGMA table_info(chat_messages)').all().map(c => c.name);
if (!chatMessageColumns.includes('sender_client_id')) {
  db.exec('ALTER TABLE chat_messages ADD COLUMN sender_client_id INTEGER REFERENCES clients(id)');
}

// --- Tickets: add client_id ---
const ticketColumns = db.prepare('PRAGMA table_info(tickets)').all().map(c => c.name);
if (!ticketColumns.includes('client_id')) {
  db.exec('ALTER TABLE tickets ADD COLUMN client_id INTEGER REFERENCES clients(id)');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON tickets(client_id)');

// --- Clients: add login/auth columns for Client Connect Portal ---
if (!clientColumns.includes('client_login_id')) {
  db.exec('ALTER TABLE clients ADD COLUMN client_login_id TEXT');
}
if (!clientColumns.includes('password_hash')) {
  db.exec('ALTER TABLE clients ADD COLUMN password_hash TEXT');
}
if (!clientColumns.includes('is_active')) {
  db.exec('ALTER TABLE clients ADD COLUMN is_active INTEGER DEFAULT 1');
}
if (!clientColumns.includes('last_login_at')) {
  db.exec('ALTER TABLE clients ADD COLUMN last_login_at DATETIME');
}
// Unique index — use IF NOT EXISTS to be idempotent
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_login_id ON clients(client_login_id)');

// --- Meetings table (used by client_portal.routes.js) ---
db.exec(`
CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id),
  team_leader_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at DATETIME NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','completed','cancelled')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_meetings_client_id ON meetings(client_id);
`);

// --- Client Reviews table (used by client_portal.routes.js) ---
db.exec(`
CREATE TABLE IF NOT EXISTS client_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id),
  client_id INTEGER REFERENCES clients(id),
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_client_reviews_client_id ON client_reviews(client_id);
`);

// --- Client Portal Banners table (used by client_portal.routes.js) ---
db.exec(`
CREATE TABLE IF NOT EXISTS client_portal_banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  image_url TEXT,
  link_url TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;
