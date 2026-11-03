// Creates the first admin account (e.g. on a fresh install).
// Usage (from project/):  node create_admin.js <email> <password> [name]
// The password must be 12+ characters with upper, lower, number and symbol.
// Nothing is stored in this file - pass the credentials when you run it.
const bcrypt = require('bcryptjs');
const db = require('./backend/db'); // same database the app uses (DB_PATH / techturf.db)

const [email, password, name = 'Admin'] = process.argv.slice(2);

function isStrongPassword(value) {
  const v = String(value || '');
  return v.length >= 12 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v) && /[^A-Za-z0-9]/.test(v);
}

if (!email || !password) {
  console.error('Usage: node create_admin.js <email> <password> [name]');
  process.exit(1);
}
if (!isStrongPassword(password)) {
  console.error('Password must be at least 12 characters and include upper, lower, number and symbol.');
  process.exit(1);
}

(async () => {
  const hash = await bcrypt.hash(password, 12);
  try {
    db.prepare(`INSERT INTO users (name, email, password, role, employment_status, is_active) VALUES (?, ?, ?, 'admin', 'active', 1)`).run(
      name, String(email).toLowerCase().trim(), hash
    );
    console.log(`Admin user created: ${String(email).toLowerCase().trim()} (sign in with role "Administrator")`);
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      console.log('A user with this email already exists.');
    } else {
      console.error('Error creating admin user:', e.message);
      process.exitCode = 1;
    }
  }
  db.close();
})();
