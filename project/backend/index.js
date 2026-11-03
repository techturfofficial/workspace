/**
 * Tech Turf Unified Backend Server
 * Handles API requests, real-time updates, and static file serving.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const initialPort = process.env.PORT;
require('dotenv').config();

// Initialize the database connection (this also creates tables if missing)
const db = require('./db');
const { verifyToken, checkRole } = require('./auth');

async function startServer() {
    const app = express();
    const PORT = initialPort || process.env.PORT || 5000;

    // Behind nginx/PM2 every request otherwise appears to come from the proxy's IP, which put
    // all employees into ONE rate-limit bucket. Trust the proxy so req.ip is the real client.
    // Set TRUST_PROXY to a hop count / subnet / "true" if the proxy is not on this machine.
    const trustProxy = process.env.TRUST_PROXY;
    app.set('trust proxy', trustProxy === undefined || trustProxy === '' ? 'loopback' : (/^\d+$/.test(trustProxy) ? Number(trustProxy) : (trustProxy === 'true' ? true : (trustProxy === 'false' ? false : trustProxy))));
    app.disable('x-powered-by');

    const compression = require('compression');
    app.use(compression({
        // SSE must not be buffered by gzip, or chat events arrive late/in bursts.
        filter: (req, res) => {
            const type = String(res.getHeader('Content-Type') || '');
            if (type.includes('text/event-stream')) return false;
            return compression.filter(req, res);
        }
    }));

    // --- MIDDLEWARES ---
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5000')
        .split(',')
        .map(o => o.trim())
        .filter(Boolean);

    app.use(cors({
        origin: (origin, cb) => {
            if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return cb(null, true);
            // Allow requests originating from same IP or domain in production
            return cb(null, true);
        },
        credentials: true
    }));

    // Rate limiting. Offices usually share one public IP, so limiting purely by IP lets a
    // handful of busy employees lock everyone else out (requests then fail with 429 and the
    // UI shows "failed to create folder" etc). Authenticated traffic is limited per verified
    // user; only anonymous traffic falls back to the client IP.
    const jwt = require('jsonwebtoken');
    const limiterKey = (req) => {
        const header = req.headers.authorization;
        const token = header && header.startsWith('Bearer ')
            ? header.slice(7)
            : (typeof req.query?.token === 'string' ? req.query.token : null);
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                return decoded.type === 'client' ? `c:${decoded.clientId}` : `u:${decoded.id}`;
            } catch (_) { /* invalid token -> treated as anonymous */ }
        }
        return `ip:${req.ip}`;
    };
    const tooMany = (message) => ({ message });
    const generalLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: Number(process.env.API_RATE_LIMIT) || 900, // per user per minute
        keyGenerator: limiterKey,
        // A single large file is sent as many chunks; don't let it trip the limiter mid-upload.
        skip: (req) => req.path === '/drive/upload-chunk',
        standardHeaders: true,
        legacyHeaders: false,
        message: tooMany('Too many requests. Please wait a moment and try again.')
    });
    // Brute-force protection: failed sign-ins are counted per IP + account, with a looser
    // per-IP ceiling so one shared office IP is not locked out by a single typo-prone user.
    const loginEmail = (req) => String(req.body?.email || '').toLowerCase().trim();
    const authAccountLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        skipSuccessfulRequests: true,
        keyGenerator: (req) => `${req.ip}|${loginEmail(req)}`,
        message: tooMany('Too many failed sign-in attempts for this account. Please try again in 15 minutes.')
    });
    const authIpLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 300,
        skipSuccessfulRequests: true,
        keyGenerator: (req) => `ip:${req.ip}`,
        message: tooMany('Too many failed sign-in attempts from this network. Please try again later.')
    });
    app.use('/api', generalLimiter);

    // Body parsing middlewares MUST be placed BEFORE any route definitions
    // Raw upload chunks are streamed by their route; never let a body parser consume them.
    const unlessChunk = (mw) => (req, res, next) => (req.path === '/api/drive/upload-chunk' ? next() : mw(req, res, next));
    app.use(unlessChunk(express.json({ limit: '10mb' })));
    app.use(unlessChunk(express.urlencoded({ limit: '10mb', extended: true })));
    app.use('/api/auth/login', authIpLimiter, authAccountLimiter);

    // API request log (stored outside backend/ to avoid watcher trigger). Uses one buffered
    // append stream instead of a synchronous disk write per request, which blocked the event
    // loop under load. Set REQUEST_LOG=off to disable.
    const logPath = path.join(__dirname, '../server.log');
    try {
        if (fs.existsSync(logPath) && fs.statSync(logPath).size > 20 * 1024 * 1024) {
            fs.renameSync(logPath, `${logPath}.old`);
        }
    } catch (_) { /* rotation is best effort */ }
    const logStream = process.env.REQUEST_LOG === 'off' ? null : fs.createWriteStream(logPath, { flags: 'a' });
    if (logStream) logStream.on('error', () => {});
    const logToFile = (msg) => {
        if (logStream) logStream.write(`[${new Date().toLocaleTimeString()}] ${msg}\n`);
    };
    app.use((req, res, next) => {
        req.requestId = crypto.randomUUID();
        res.setHeader('x-request-id', req.requestId);
        if (req.url.startsWith('/api')) {
            const started = process.hrtime.bigint();
            res.on('finish', () => {
                const ms = Number(process.hrtime.bigint() - started) / 1e6;
                logToFile(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms.toFixed(0)}ms`);
            });
        }
        next();
    });

    global.logToFile = logToFile;


    // --- API ROUTES ---
    app.use('/api/auth', require('./routes/auth.routes'));
    app.use('/api/users', require('./routes/users.routes'));
    app.use('/api/projects', require('./routes/projects.routes'));
    app.use('/api/tasks', require('./routes/tasks.routes'));
    app.use('/api/submissions', require('./routes/submissions.routes'));
    app.use('/api/nexus', require('./routes/nexus.routes'));
    app.use('/api/clients', require('./routes/clients.routes'));
    app.use('/api/announcements', require('./routes/announcements.routes'));
    app.use('/api/notifications', require('./routes/notifications.routes'));
    app.use('/api/courses', require('./routes/courses.routes'));
    app.use('/api/drive', require('./routes/drive.routes'));
    app.use('/api/drive', require('./routes/drive_upload_chunk.routes'));
    app.use('/api/dbadmin', require('./routes/dbadmin.routes'));
    app.use('/api/tickets', require('./routes/tickets.routes'));
    app.use('/api/payments', require('./routes/payments.routes'));
    app.use('/api/admin', require('./routes/admin.routes'));
    app.use('/api/teams', require('./routes/teams.routes'));
    app.use('/api/messages', require('./routes/messages.routes'));
    app.use('/api/workspace', require('./routes/workspace.routes'));
    app.use('/api/client-connect', require('./routes/client_connect.routes'));
    app.use('/api/client-portal', require('./routes/client_portal.routes'));
    app.use('/api/client-reports', require('./routes/client_reports.routes'));
    app.use('/api/enterprise', require('./routes/enterprise.routes'));
    // Role workspaces whose pages already call these APIs (they were never mounted).
    app.use('/api/design-vault', require('./routes/design_vault.routes'));
    app.use('/api/nexus-lab', require('./routes/nexus_lab.routes'));
    app.use('/api/broadcast-hub', require('./routes/broadcast_hub.routes'));
    app.use('/api/creator-slate', require('./routes/creator_slate.routes'));
    app.use('/api/content-forge', require('./routes/content_forge.routes'));
    app.use('/api/operation-hq', require('./routes/operation_hq.routes'));

    // --- ANALYTICS (Injected Routes) ---
    app.get('/api/analytics/top-performers', verifyToken, (req, res) => {
        try {
            const period = (req.query.period || 'month').toLowerCase();
            const now = new Date();
            const currentMonthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

            let query = '';
            if (period === 'month') {
                // Monthly points aggregated from performance_log for the current calendar month
                query = `
                    SELECT 
                        u.id, u.name, u.role, u.avatar,
                        COALESCE(SUM(pl.score), 0) as points,
                        u.points as lifetime_points
                    FROM users u
                    LEFT JOIN performance_log pl ON pl.user_id = u.id 
                        AND strftime('%Y-%m', pl.created_at) = strftime('%Y-%m', 'now')
                    WHERE u.is_active = 1
                    GROUP BY u.id
                    ORDER BY points DESC, lifetime_points DESC, u.name ASC
                    LIMIT 4
                `;
            } else {
                // All-time cumulative points
                query = `
                    SELECT 
                        u.id, u.name, u.role, u.avatar,
                        u.points as points,
                        u.points as lifetime_points
                    FROM users u
                    WHERE u.is_active = 1
                    ORDER BY u.points DESC, u.name ASC
                    LIMIT 4
                `;
            }

            const topPerformers = db.prepare(query).all();
            res.json({
                period,
                month_label: currentMonthName,
                performers: topPerformers
            });
        } catch (e) {
            console.error('Top performers error:', e);
            res.status(500).json({ error: 'Failed to load top performers' });
        }
    });

    app.get('/api/analytics/summary', verifyToken, (req, res) => {
        try {
            const users = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active=1').get().count;
            const projects = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status != 'archived'").get().count;
            const tasks = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count;
            const submissions = db.prepare('SELECT COUNT(*) as count FROM submissions').get().count;
            const logins = db.prepare("SELECT COUNT(*) as count FROM login_log WHERE login_at >= date('now', '-30 days')").get().count;
            res.json({ users, projects, tasks, submissions, logins });
        } catch (e) {
            console.error('Analytics summary error:', e);
            res.status(500).json({ error: 'Failed to load analytics summary' });
        }
    });

    // System Health Endpoint
    const os = require('os');
    app.get('/api/system/health', (req, res) => {
        let dbSize = 0;
        try {
            const dbPath = process.env.DB_PATH || path.join(__dirname, '../storage/techturf.db');
            dbSize = fs.statSync(dbPath).size;
        } catch { }
        res.json({
            uptime: os.uptime(),
            totalmem: os.totalmem(),
            freemem: os.freemem(),
            platform: os.platform(),
            dbSize,
            time: new Date().toISOString()
        });
    });

    // --- INTEGRATIONS ---
    app.get('/api/integrations/status', (req, res) => {
        res.json({
            integrations: [
                { name: 'Nexus AI', status: 'ok' },
                { name: 'File Drive', status: 'ok' },
                { name: 'Email Notifications', status: 'ok' }
            ]
        });
    });

    // --- SETTINGS ---
    app.get('/api/settings', verifyToken, checkRole('admin'), (req, res) => {
        try {
            const rows = db.prepare('SELECT * FROM settings').all();
            res.json(rows);
        } catch (e) {
            console.error('Settings error:', e);
            res.status(500).json({ error: 'Failed to load settings' });
        }
    });

    // --- AUDIT LOG ---
    app.get('/api/audit', verifyToken, checkRole('admin'), (req, res) => {
        try {
            const rows = db.prepare('SELECT a.*, u.name as user_name FROM audit_log a LEFT JOIN users u ON a.user_id = u.id ORDER BY created_at DESC LIMIT 200').all();
            res.json(rows);
        } catch (e) {
            console.error('Audit route error:', e);
            res.status(500).json({ error: 'Failed to load audit entries' });
        }
    });

    // Unknown API routes: answer with a JSON 404 instead of falling through to the HTML
    // app shell (which returned 200 and made broken API calls look successful).
    app.use('/api', (req, res) => {
        res.status(404).json({ message: `API route not found: ${req.method} ${req.originalUrl.split('?')[0]}` });
    });

    // --- STATIC FILES ---
    const uploadsDir1 = path.join(__dirname, '../uploads');
    const uploadsDir2 = path.join(__dirname, '../storage/uploads');
    if (!fs.existsSync(uploadsDir1)) fs.mkdirSync(uploadsDir1, { recursive: true });
    if (!fs.existsSync(uploadsDir2)) fs.mkdirSync(uploadsDir2, { recursive: true });

    // Uploads: browsers must revalidate (so profile pics and PDFs update immediately), but
    // with ETag/Last-Modified an unchanged file is answered with a tiny 304 instead of the
    // full download on every page view.
    const revalidateHeaders = (res) => res.setHeader('Cache-Control', 'no-cache');
    app.use('/uploads', express.static(uploadsDir1, { etag: true, lastModified: true, setHeaders: revalidateHeaders }));
    app.use('/uploads', express.static(uploadsDir2, { etag: true, lastModified: true, setHeaders: revalidateHeaders }));

    const clientPortalDir = path.join(__dirname, '../frontend/client-portal');
    const employeePortalDir = path.join(__dirname, '../frontend/public');

    const clientPortalStaticOptions = {
        etag: false,
        maxAge: 0,
        setHeaders: (res) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    };

    const isClientPortalInstance = (Number(PORT) === 5000 || process.env.IS_CLIENT_PORTAL === 'true');

    if (isClientPortalInstance) {
        // --- CLIENT CONNECT PORTAL INSTANCE (PORT 5000) ---
        // Serve client portal static assets from root /
        app.use(express.static(clientPortalDir, clientPortalStaticOptions));
        app.use('/client-portal', express.static(clientPortalDir, clientPortalStaticOptions));

        // Serve client portal index.html on root /
        app.get('/', (req, res) => {
            res.sendFile(path.join(clientPortalDir, 'index.html'));
        });

        // Fallback for Client Connect SPA routes
        app.get('*', (req, res) => {
            if (path.extname(req.path)) {
                return res.status(404).send('File not found');
            }
            res.sendFile(path.join(clientPortalDir, 'index.html'));
        });
    } else {
        // --- EMPLOYEE CRM PORTAL INSTANCE (PORT 3000 / DEFAULT) ---
        // Also allow access to /client-portal route for employee preview
        app.use('/client-portal', express.static(clientPortalDir, clientPortalStaticOptions));
        
        app.get('/client-portal', (req, res) => {
            res.redirect('/client-portal/');
        });

        app.get('/client-portal/*', (req, res) => {
            res.sendFile(path.join(clientPortalDir, 'index.html'));
        });

        // Serve main CRM frontend. HTML/JS/CSS are always revalidated so deploys show up
        // immediately, but ETags turn repeat loads into 304s; images/fonts are cached briefly.
        app.use(express.static(employeePortalDir, {
            etag: true,
            lastModified: true,
            setHeaders: (res, filePath) => {
                if (/\.(html|js|css|json)$/i.test(filePath)) {
                    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
                } else {
                    res.setHeader('Cache-Control', 'public, max-age=3600');
                }
            }
        }));

        // Fallback for main CRM SPA routes
        app.get('*', (req, res) => {
            if (path.extname(req.path)) {
                return res.status(404).send('File not found');
            }
            res.sendFile(path.join(employeePortalDir, 'index.html'));
        });
    }


    // JSON errors for the API instead of Express's HTML page (which also leaked stack traces).
    app.use((err, req, res, next) => {
        if (res.headersSent) return next(err);
        const status = err.status || err.statusCode || 500;
        if (status >= 500) console.error(`[${req.requestId}] Unhandled error:`, err);
        res.status(status).json({ message: status >= 500 ? 'Internal server error' : (err.expose ? err.message : 'Bad request') });
    });

    // --- BACKGROUND SERVICES ---
    // Deadline Pulse: Runs periodic checks for task deadlines
    function runDeadlineAlerts() {
        try {
            const now = new Date().toISOString();
            // This is a simplified version for the log
            console.log(`[Deadline Pulse] Checking deadlines at ${now}`);
        } catch (e) { console.error('[Deadline Pulse Error]', e.message); }
    }
    setInterval(runDeadlineAlerts, 60 * 60 * 1000); // Every hour
    runDeadlineAlerts();

    // --- START SERVER ---
    // Startup diagnostics to ensure environment is deployable before serving heavy traffic.
    const runStartupDiagnostics = () => {
        const diagnostics = {
            dbPath: process.env.DB_PATH || path.join(__dirname, '../techturf.db'),
            uploadsDir: path.join(__dirname, '../uploads'),
            jwtConfigured: Boolean(process.env.JWT_SECRET),
            portalMode: isClientPortalInstance ? 'Client Connect (Port 5000)' : 'Employee CRM (Port 3000)'
        };

        try {
            if (!fs.existsSync(diagnostics.uploadsDir)) fs.mkdirSync(diagnostics.uploadsDir, { recursive: true });
            fs.accessSync(diagnostics.uploadsDir, fs.constants.W_OK);
            diagnostics.uploadsWritable = true;
        } catch {
            diagnostics.uploadsWritable = false;
        }

        try {
            db.prepare('SELECT 1').get();
            diagnostics.dbReachable = true;
        } catch {
            diagnostics.dbReachable = false;
        }

        console.log('[Startup Diagnostics]', diagnostics);
    };
    runStartupDiagnostics();

    const server = app.listen(PORT, '0.0.0.0', () => {
        if (isClientPortalInstance) {
            console.log(`\n🚀 Tech Turf Client Connect Portal is operational at PORT ${PORT}`);
            console.log(`   - Client Connect: http://localhost:${PORT}`);
            console.log(`   - Client Login:   http://localhost:${PORT}/login.html`);
            console.log(`   - API Root:       http://localhost:${PORT}/api\n`);
        } else {
            console.log(`\n🚀 Tech Turf Employee Portal is operational at PORT ${PORT}`);
            console.log(`   - Employee Portal: http://localhost:${PORT}`);
            console.log(`   - Client Portal:   http://localhost:${PORT}/client-portal`);
            console.log(`   - API Root:        http://localhost:${PORT}/api\n`);
        }
    });
    // Keep idle connections open longer than nginx's upstream keepalive so reused sockets
    // are not closed under it (which surfaces as random 502s under load).
    server.keepAliveTimeout = 65 * 1000;
    server.headersTimeout = 66 * 1000;
}

// Global error handling for the process
process.on('uncaughtException', (err) => {
    const errorId = crypto.randomUUID();
    console.error('CRITICAL ERROR:', { errorId, message: err.message, stack: err.stack });
    process.exit(1);
});

startServer();
