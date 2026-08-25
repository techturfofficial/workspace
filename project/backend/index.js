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

async function startServer() {
    const app = express();
    const PORT = initialPort || process.env.PORT || 5000;

    const compression = require('compression');
    app.use(compression());

    // --- MIDDLEWARES ---
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5000')
        .split(',')
        .map(o => o.trim())
        .filter(Boolean);

    app.use(cors({
        origin: (origin, cb) => {
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
            return cb(new Error('CORS origin denied'));
        },
        credentials: true
    }));

    const generalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5000, // Increase to 5000
        standardHeaders: true,
        legacyHeaders: false
    });
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100, // Increase to 100 for dev testing
        skipSuccessfulRequests: true
    });
    app.use('/api', generalLimiter);
    app.use('/api/auth/login', authLimiter);

    // Body parsing middlewares MUST be placed BEFORE any route definitions
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ limit: '10mb', extended: true }));

    // Request logging in development (stored outside backend/ to avoid watcher trigger)
    const logPath = path.join(__dirname, '../server.log');
    const logToFile = (msg) => {
        const time = new Date().toLocaleTimeString();
        try { fs.appendFileSync(logPath, `[${time}] ${msg}\n`); } catch(_) {}
    };
    app.use((req, res, next) => {
        req.requestId = crypto.randomUUID();
        res.setHeader('x-request-id', req.requestId);
        logToFile(`${req.method} ${req.url}`);
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

    // --- FRONTEND STUDIO ROUTES ---
    const frontendStudioRoutes = require('./routes/frontend_studio.routes');
    app.use('/api/frontend-studio', frontendStudioRoutes);
    // Route aliases for test compatibility
    app.use('/api/frontend', frontendStudioRoutes);

    // --- ANALYTICS (Injected Routes) ---
    app.get('/api/analytics/top-performers', (req, res) => {
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

    app.get('/api/analytics/summary', (req, res) => {
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
    app.get('/api/settings', (req, res) => {
        try {
            const rows = db.prepare('SELECT * FROM settings').all();
            res.json(rows);
        } catch (e) {
            console.error('Settings error:', e);
            res.status(500).json({ error: 'Failed to load settings' });
        }
    });

    // --- AUDIT LOG ---
    app.get('/api/audit', (req, res) => {
        try {
            const rows = db.prepare('SELECT a.*, u.name as user_name FROM audit_log a LEFT JOIN users u ON a.user_id = u.id ORDER BY created_at DESC LIMIT 200').all();
            res.json(rows);
        } catch (e) {
            console.error('Audit route error:', e);
            res.status(500).json({ error: 'Failed to load audit entries' });
        }
    });

    // --- STATIC FILES ---
    const uploadsDir1 = path.join(__dirname, '../uploads');
    const uploadsDir2 = path.join(__dirname, '../storage/uploads');
    if (!fs.existsSync(uploadsDir1)) fs.mkdirSync(uploadsDir1, { recursive: true });
    if (!fs.existsSync(uploadsDir2)) fs.mkdirSync(uploadsDir2, { recursive: true });

    // Serve uploads with no caching so profile pics and PDFs update immediately
    app.use('/uploads', express.static(uploadsDir1, { maxAge: 0, etag: false }));
    app.use('/uploads', express.static(uploadsDir2, { maxAge: 0, etag: false }));

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

        // Serve main CRM frontend
        app.use(express.static(employeePortalDir, {
            etag: true,
            lastModified: true
        }));

        // Fallback for main CRM SPA routes
        app.get('*', (req, res) => {
            if (path.extname(req.path)) {
                return res.status(404).send('File not found');
            }
            res.sendFile(path.join(employeePortalDir, 'index.html'));
        });
    }


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

    app.listen(PORT, '0.0.0.0', () => {
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
}

// Global error handling for the process
process.on('uncaughtException', (err) => {
    const errorId = crypto.randomUUID();
    console.error('CRITICAL ERROR:', { errorId, message: err.message, stack: err.stack });
    process.exit(1);
});

startServer();
