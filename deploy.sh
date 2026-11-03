#!/bin/bash
# TechTurf Safe Deployment Script
# The database runs in SQLite WAL mode, so recent writes may live in techturf.db-wal.
# The app is stopped first (it checkpoints and closes the DB on shutdown), then a
# consistent backup is taken, so no data is lost and no stale WAL file is left behind.
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"
DB="techturf.db"
BACKUP=""

echo "================================================="
echo " TechTurf Production Safe Deployment"
echo "================================================="

# 1. Stop the backend so the database is checkpointed and closed cleanly.
echo "[1/6] Stopping backend..."
if command -v pm2 &> /dev/null; then
  pm2 stop techturf-backend 2>/dev/null || pm2 stop all 2>/dev/null || true
else
  pkill -f "backend/index.js" 2>/dev/null || true
fi
sleep 2

# 2. Database Safety: consistent backup of the live database
if [ -f "$DB" ]; then
  BACKUP="$DB.backup_$(date +%Y%m%d_%H%M%S)"
  echo "[2/6] Backing up live database to $BACKUP..."
  if ! node "$DIR/project/backend/scripts/backup-db.js" "$DB" "$BACKUP" 2>/dev/null; then
    # Fallback (app is stopped, so a plain copy of the checkpointed file is consistent)
    cp "$DB" "$BACKUP"
  fi
fi

# 3. Reset local changes to git-tracked files (avoiding merge blocks).
# techturf.db is no longer tracked by git; on the first deploy after that change,
# "git reset --hard" removes the old tracked copy and step 5 restores the live data.
echo "[3/6] Cleaning local git state..."
git checkout -- "$DB" 2>/dev/null || true
git stash || true

# 4. Pull latest changes from remote
echo "[4/6] Pulling latest code from origin main..."
git fetch origin main
git reset --hard origin/main

# 5. Restore this deployment's backup so live user data is preserved
if [ -n "$BACKUP" ] && [ -f "$BACKUP" ]; then
  echo "[5/6] Restoring live database from $BACKUP..."
  cp "$BACKUP" "$DB"
  # WAL/SHM files belong to the pre-restore file; the backup is self-contained.
  rm -f "$DB-wal" "$DB-shm"
else
  echo "[5/6] Using current database."
fi

# 6. Install dependencies, sync files and start
echo "[6/6] Updating dependencies and restarting services..."
cd "$DIR/project"
npm install --production

# If Nginx static employee folder exists, sync public files
if [ -d "/var/www/employee" ]; then
  echo "Syncing frontend to /var/www/employee..."
  cp -r "$DIR/project/frontend/public/"* /var/www/employee/
fi

if command -v pm2 &> /dev/null; then
  echo "Starting PM2 backend..."
  pm2 restart techturf-backend 2>/dev/null || pm2 restart all 2>/dev/null || pm2 start backend/index.js --name techturf-backend
  pm2 save
else
  echo "Starting Node process directly..."
  nohup node backend/index.js > ../server.log 2>&1 &
fi

echo "================================================="
echo " Deployment Successfully Completed!"
echo " Current Commit: $(git rev-parse --short HEAD)"
echo " Please hard refresh your browser (Ctrl + F5 or Cmd + Shift + R)."
echo "================================================="
