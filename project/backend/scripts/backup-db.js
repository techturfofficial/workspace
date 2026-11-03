/**
 * Consistent SQLite snapshot (safe while the DB is in WAL mode or still open elsewhere).
 * Usage: node backend/scripts/backup-db.js <source.db> <destination.db>
 */
const Database = require('better-sqlite3');

const [src, dest] = process.argv.slice(2);
if (!src || !dest) {
  console.error('Usage: node backup-db.js <source.db> <destination.db>');
  process.exit(1);
}

const db = new Database(src, { fileMustExist: true });
db.backup(dest)
  .then(() => {
    db.close();
    console.log(`Backup written to ${dest}`);
  })
  .catch((err) => {
    console.error('Backup failed:', err.message);
    process.exit(1);
  });
