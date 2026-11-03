# TechTurf Production Deployment Guide

## Folder Structure

```
techturf/
├── frontend/
│   └── dist/
├── backend/
│   ├── index.js
│   ├── db.js
│   ├── routes/
│   └── services/
├── storage/
│   ├── techturf.db
│   ├── uploads/
│   └── drive_storage/
├── .env
├── package.json
└── README.md
```

## Deployment Steps

1. **Install dependencies and build frontend**
   ```bash
   cd frontend
   npm ci
   npm run build
   cd ..
   ```
2. **Install backend dependencies**
   ```bash
   cd backend
   npm ci
   cd ..
   ```
3. **Start backend with PM2**
   ```bash
   pm2 start backend/index.js --name techturf-backend
   ```

## Database

The SQLite database (`techturf.db`) is **not stored in git**: it holds employee and
client data and password hashes. A fresh install starts with an empty database. Create
the first admin from the `project` folder:

```bash
node create_admin.js you@techturf.com 'Your#Strong1Password' "Your Name"
```

Back up the live database with
`node project/backend/scripts/backup-db.js techturf.db techturf.db.backup_<date>`.
`deploy.sh` does this automatically before every update.

## NGINX Example Config

```
server {
    listen 80;
    server_name yourdomain.com;
    root /var/www/employee;
    location / {
        try_files $uri /index.html;
    }
    # Static files: revalidate HTML/JS/CSS (deploys show immediately), cache images briefly
    location ~* \.(html|js|css)$ {
        add_header Cache-Control "no-cache, must-revalidate";
        try_files $uri =404;
    }
    location ~* \.(png|jpe?g|gif|svg|webp|ico|woff2?)$ {
        add_header Cache-Control "public, max-age=3600";
        try_files $uri =404;
    }

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # nginx defaults to 1 MB, which rejects most Secure Drive uploads with 413
        client_max_body_size 110m;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
    }
    # Live chat (Server-Sent Events) must not be buffered
    location /api/messages/stream {
        proxy_pass http://localhost:5000/api/messages/stream;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

The backend trusts `X-Forwarded-For` from a proxy on the same machine (so rate limits
are per real user/IP). If nginx runs on a different host, set `TRUST_PROXY` in `.env`
(e.g. `TRUST_PROXY=1`). Per-user API limit: `API_RATE_LIMIT` (default 900 requests/min).

## Security
- `.env`, `storage/`, and logs are ignored by git and not served by NGINX.
- Database and uploads are not publicly accessible.

## Validation Checklist
- [ ] Frontend loads correctly
- [ ] API works via `/api`
- [ ] Database connects
- [ ] File uploads work
- [ ] No broken imports
