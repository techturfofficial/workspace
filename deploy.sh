#!/bin/bash
# TechTurf Zero-Downtime Safe Deployment Script
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "================================================="
echo " TechTurf Production Safe Deployment"
echo "================================================="

# 1. Database Safety: Backup local database
if [ -f "techturf.db" ]; then
  echo "[1/5] Backing up live database..."
  cp techturf.db "techturf.db.backup_$(date +%Y%m%d_%H%M%S)"
fi

# 2. Reset local changes to git-tracked files (avoiding merge blocks)
echo "[2/5] Cleaning local git state..."
git checkout -- techturf.db 2>/dev/null || true
git stash || true

# 3. Pull latest changes from remote
echo "[3/5] Pulling latest code from origin main..."
git fetch origin main
git reset --hard origin/main

# 4. If a live database backup exists, preserve user data
LATEST_BACKUP=$(ls -t techturf.db.backup_* 2>/dev/null | head -n 1 || true)
if [ -n "$LATEST_BACKUP" ] && [ -f "$LATEST_BACKUP" ]; then
  echo "[4/5] Restoring live database from $LATEST_BACKUP..."
  cp "$LATEST_BACKUP" techturf.db
else
  echo "[4/5] Using current database."
fi

# 5. Install dependencies and sync files
echo "[5/5] Updating dependencies and restarting services..."
cd "$DIR/project"
npm install --production

# If Nginx static employee folder exists, sync public files
if [ -d "/var/www/employee" ]; then
  echo "Syncing frontend to /var/www/employee..."
  cp -r "$DIR/project/frontend/public/"* /var/www/employee/
fi

# Restart PM2
if command -v pm2 &> /dev/null; then
  echo "Restarting PM2 backend..."
  pm2 restart techturf-backend 2>/dev/null || pm2 restart all 2>/dev/null || pm2 start backend/index.js --name techturf-backend
  pm2 save
else
  echo "Restarting Node process directly..."
  pkill -f "backend/index.js" 2>/dev/null || true
  nohup node backend/index.js > ../server.log 2>&1 &
fi

echo "================================================="
echo " Deployment Successfully Completed!"
echo " Current Commit: $(git rev-parse --short HEAD)"
echo " Please hard refresh your browser (Ctrl + F5 or Cmd + Shift + R)."
echo "================================================="
