#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PROJECT_DIR="$DIR/project"
if [ ! -d "$PROJECT_DIR" ]; then
  PROJECT_DIR="$DIR"
fi

cd "$PROJECT_DIR"

# Install backend dependencies
echo "Installing dependencies..."
npm install --production

# Restart or start PM2 process
if command -v pm2 &> /dev/null; then
  echo "Restarting backend with PM2..."
  pm2 restart techturf-backend 2>/dev/null || pm2 start backend/index.js --name techturf-backend
  pm2 save
  echo "Backend restarted successfully under PM2."
else
  echo "PM2 not found. Starting with Node..."
  node backend/index.js
fi
