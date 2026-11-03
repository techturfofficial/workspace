const db = require('../db');
const { sendMail } = require('./mailer');

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

async function notifyUsers(userIds, message, type = 'info', emailSubject = 'Tech Turf Notification') {
  const ids = [...new Set(toArray(userIds).map(Number).filter(Boolean))];
  if (ids.length === 0 || !message) return { notified: 0 };

  const insertStmt = db.prepare('INSERT INTO notifications(user_id, message, type) VALUES(?,?,?)');
  const getUserStmt = db.prepare('SELECT id, name, email, is_active FROM users WHERE id=?');

  for (const id of ids) {
    insertStmt.run(id, message, type);
    const user = getUserStmt.get(id);
    if (user && Number(user.is_active) === 1 && user.email) {
      await sendMail({
        to: user.email,
        subject: emailSubject,
        text: `${user.name || 'User'},\n\n${message}\n\n- Tech Turf`
      });
    }
  }

  return { notified: ids.length };
}

async function notifyByRole(roleName, message, type = 'info', emailSubject = 'Tech Turf Notification') {
  const users = db.prepare("SELECT id FROM users WHERE is_active=1 AND (role=? OR (',' || COALESCE(secondary_roles, '') || ',') LIKE ?)").all(roleName, `%,${roleName},%`);
  return notifyUsers(users.map(u => u.id), message, type, emailSubject);
}

module.exports = {
  notifyUsers,
  notifyByRole
};
