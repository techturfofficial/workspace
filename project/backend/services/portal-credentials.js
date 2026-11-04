// Client portal credentials: sequential Access IDs and admin-viewable passwords.
//
// Passwords are still checked against the bcrypt hash; the encrypted copy only exists so
// an admin can look the password up on the client page. It is AES-256-GCM encrypted with
// a key derived from JWT_SECRET, so changing JWT_SECRET makes stored copies unreadable
// (the page then asks for a reset) without affecting sign-in.
const crypto = require('crypto');
require('dotenv').config();

const ID_PREFIX = 'TT-CLI-';

function key() {
  return crypto.createHash('sha256').update('tt-client-portal-password:' + process.env.JWT_SECRET).digest();
}

function encryptPassword(password) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(password), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

function decryptPassword(stored) {
  try {
    const [version, iv, tag, data] = String(stored || '').split(':');
    if (version !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}

// Next free sequential Access ID: one more than the highest TT-CLI-<number> in use.
function nextClientLoginId(db) {
  const rows = db.prepare("SELECT client_login_id FROM clients WHERE client_login_id LIKE 'TT-CLI-%'").all();
  const highest = rows.reduce((max, r) => {
    const m = /^TT-CLI-(\d+)$/.exec(r.client_login_id || '');
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return ID_PREFIX + String(highest + 1).padStart(4, '0');
}

module.exports = { encryptPassword, decryptPassword, nextClientLoginId };
