const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('./db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, secondary_roles: user.secondary_roles || '', name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}
function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  const queryToken = req.query?.token;
  const token = header && header.startsWith('Bearer ')
    ? header.split(' ')[1]
    : (typeof queryToken === 'string' && queryToken.trim() ? queryToken.trim() : null);

  if (!token) {
    return res.status(401).json({ message: 'Invalid authorization header' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type === 'client') {
      return res.status(403).json({ message: 'Forbidden — client token not allowed on staff routes' });
    }

    // Always resolve the latest account state from DB so admin role/status updates
    // apply immediately to already logged-in sessions.
    const dbUser = db.prepare('SELECT id,name,email,role,secondary_roles,is_active FROM users WHERE id=?').get(decoded.id);
    if (!dbUser || Number(dbUser.is_active) !== 1) {
      return res.status(401).json({ message: 'Account inactive or not found' });
    }

    req.user = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      secondary_roles: dbUser.secondary_roles || ''
    };
    next();
  } catch(e) {
    console.error('Token validation failed:', e.message);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
function checkRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const primaryMatch = roles.includes(req.user.role);
    const secondaryRoles = (req.user.secondary_roles || '').split(',').map(r => r.trim()).filter(Boolean);
    const secondaryMatch = secondaryRoles.some(r => roles.includes(r));
    if (!primaryMatch && !secondaryMatch) {
      return res.status(403).json({ message: `Forbidden — requires: ${roles.join(' | ')}` });
    }
    next();
  };
}

const ROLE_PERMISSION_MAP = {
  admin: ['*'],
  team_leader: [
    'dashboard.view', 'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.approve',
    'projects.view', 'projects.create', 'projects.edit', 'chat.send', 'submissions.review'
  ],
  writer: ['dashboard.view', 'tasks.view', 'projects.view', 'chat.send'],
  designer: ['dashboard.view', 'tasks.view', 'projects.view', 'chat.send'],
  rnd: ['dashboard.view', 'tasks.view', 'projects.view', 'reports.view', 'chat.send'],
  media_manager: ['dashboard.view', 'tasks.view', 'projects.view', 'announcements.manage', 'chat.send'],
  frontend: ['dashboard.view', 'tasks.view', 'projects.view', 'chat.send'],
  backend: [
    'dashboard.view', 'tasks.view', 'tasks.edit',
    'projects.view', 'projects.edit', 'reports.view', 'chat.send'
  ],
  frontend_backend: [
    'dashboard.view', 'tasks.view', 'tasks.create', 'tasks.edit',
    'projects.view', 'projects.create', 'projects.edit', 'chat.send'
  ]
};

function collectPermissions(user) {
  const roles = [user.role, ...(user.secondary_roles || '').split(',').map(r => r.trim()).filter(Boolean)];
  const permissionSet = new Set();
  roles.forEach(role => {
    (ROLE_PERMISSION_MAP[role] || []).forEach(permission => permissionSet.add(permission));
  });
  return permissionSet;
}

function checkPermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const permissionSet = collectPermissions(req.user);
    if (permissionSet.has('*')) return next();
    const allowed = permissions.some(permission => permissionSet.has(permission));
    if (!allowed) {
      return res.status(403).json({ message: `Forbidden — requires permission: ${permissions.join(' | ')}` });
    }
    return next();
  };
}

function isStrongPassword(password) {
  const value = String(password || '');
  const hasLength = value.length >= 12;
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasNumber = /\d/.test(value);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(value);
  return hasLength && hasUpper && hasLower && hasNumber && hasSymbol;
}

function verifyClientToken(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ message: 'Invalid authorization header' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'client') {
      return res.status(403).json({ message: 'Forbidden — invalid token type' });
    }

    const client = db.prepare('SELECT id, name, company, is_active FROM clients WHERE id=?').get(decoded.clientId);
    if (!client || Number(client.is_active) !== 1) {
      return res.status(401).json({ message: 'Client account inactive or not found' });
    }

    req.clientId = client.id;
    req.client = client;
    next();
  } catch(e) {
    console.error('Client token validation failed:', e.message);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * Middleware: requireClientScope
 * Must be used AFTER verifyClientToken.
 * Derives client_id from the verified client JWT token (set by verifyClientToken).
 * Injects req.clientScope = { clientId } into the request.
 * Rejects if client_id is missing or invalid.
 * NEVER trusts client_id from req.body or req.query — only from the decoded token.
 * This middleware is built against the real (non-bypass) auth path, so removing
 * the dev bypass later requires zero changes to integration code.
 */
function requireClientScope(req, res, next) {
  const clientId = req.clientId; // Set by verifyClientToken from decoded JWT
  if (!clientId || !Number.isInteger(clientId) || clientId <= 0) {
    return res.status(403).json({ message: 'Client scope unavailable — invalid or missing client identity' });
  }
  req.clientScope = { clientId };
  next();
}

module.exports = { hashPassword, comparePassword, generateToken, verifyToken, verifyClientToken, requireClientScope, checkRole, checkPermission, isStrongPassword };
