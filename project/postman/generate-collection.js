/**
 * Generates the TechTurf Postman collection + environment from this file and the route
 * sources (the "no login" and "wrong role" sections are built from every route in
 * backend/routes, so new endpoints get security tests automatically).
 *
 * Usage (from project/):  node postman/generate-collection.js
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const BACKEND = path.join(__dirname, '..', 'backend');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const lines = (s) => s.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n').map(l => l.replace(/^ {0,6}/, ''));
const testEv = (src) => ({ listen: 'test', script: { type: 'text/javascript', exec: lines(src) } });
const preEv = (src) => ({ listen: 'prerequest', script: { type: 'text/javascript', exec: lines(src) } });
const json = (obj) => ({ mode: 'raw', raw: JSON.stringify(obj, null, 2), options: { raw: { language: 'json' } } });
const bearer = (v) => ({ type: 'bearer', bearer: [{ key: 'token', value: `{{${v}}}`, type: 'string' }] });

function url(p, query) {
  const [pathPart, qs] = p.split('?');
  const u = { raw: '{{base_url}}' + p, host: ['{{base_url}}'], path: pathPart.split('/').filter(Boolean) };
  const q = query || (qs ? qs.split('&').map(kv => { const [key, value = ''] = kv.split('='); return { key, value }; }) : null);
  if (q) u.query = q;
  return u;
}

/** Status assertion (+ optional extra test lines). `status` may be a number or an array. */
function expect(status, extra = '') {
  const list = Array.isArray(status) ? status : [status];
  const assertion = list.length === 1
    ? `pm.test('Status ${list[0]}', () => pm.response.to.have.status(${list[0]}));`
    : `pm.test('Status is one of ${list.join('/')}', () => pm.expect([${list.join(',')}]).to.include(pm.response.code));`;
  return assertion + '\n' + extra;
}

/** Skip the request when any of the listed environment variables is empty. */
function needs(...vars) {
  return `
  const missing = ${JSON.stringify(vars)}.filter(v => !pm.environment.get(v));
  if (missing.length) { console.log('Skipping (missing ' + missing.join(', ') + ')'); pm.execution.skipRequest(); }
  `;
}
const optionalOnly = `
  if (String(pm.environment.get('run_notifying_tests')) !== 'true') {
    console.log('Skipping: set run_notifying_tests=true to run tests that notify/email all staff');
    pm.execution.skipRequest();
  }
`;

function req(name, method, p, opts = {}) {
  const { body, token, tests, pre, headers = [], query, description } = opts;
  const header = [...headers];
  if (body && body.mode === 'raw' && body.options && !header.some(h => /content-type/i.test(h.key))) {
    header.unshift({ key: 'Content-Type', value: 'application/json' });
  }
  const item = {
    name,
    event: [pre && preEv(pre), tests && testEv(tests)].filter(Boolean),
    request: { method, header, auth: token ? bearer(token) : { type: 'noauth' }, url: url(p, query) }
  };
  if (body) item.request.body = body;
  if (description) item.request.description = description;
  return item;
}
const folder = (name, items, description, extra = {}) => ({ name, description, item: items, ...extra });

// ---------------------------------------------------------------------------
// Route inventory (drives the generated security sections)
// ---------------------------------------------------------------------------
const indexSrc = fs.readFileSync(path.join(BACKEND, 'index.js'), 'utf8');
const mounts = {};
for (const m of indexSrc.matchAll(/app\.use\('([^']+)',\s*require\('\.\/routes\/([^']+)'\)\)/g)) {
  if (!mounts[m[2]]) mounts[m[2]] = m[1];
}
// Fallback mount points (used if a router is ever missing from index.js, so its endpoints
// still get security tests - which then fail and reveal the missing mount).
const UNMOUNTED = {
  'broadcast_hub.routes': '/api/broadcast-hub',
  'content_forge.routes': '/api/content-forge',
  'creator_slate.routes': '/api/creator-slate',
  'design_vault.routes': '/api/design-vault',
  'nexus_lab.routes': '/api/nexus-lab',
  'operation_hq.routes': '/api/operation-hq'
};

const DESIGNER_PERMISSIONS = ['dashboard.view', 'tasks.view', 'projects.view', 'chat.send'];
// Endpoints that are intentionally reachable without a staff login.
const PUBLIC_OK = new Set([
  'POST /api/auth/login', 'GET /api/auth/invite/:token', 'POST /api/auth/invite/:token/accept',
  'POST /api/client-portal/login', 'POST /api/client-connect/verify-pass', 'GET /api/client-connect/portal-data',
  'GET /api/enterprise/health'
]);

const PARAM_VALUES = { name: 'users', entity: 'users', key: 'postman_nonexistent_key', index: '0' };
const fillParams = (p) => p.replace(/:([A-Za-z_]+)/g, (_, k) => PARAM_VALUES[k] || '999999');

const routes = [];
for (const file of fs.readdirSync(path.join(BACKEND, 'routes')).sort()) {
  const mod = file.replace(/\.js$/, '');
  const base = mounts[mod] || UNMOUNTED[mod];
  if (!base) continue;
  const src = fs.readFileSync(path.join(BACKEND, 'routes', file), 'utf8');
  for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,([^\n]*)/g)) {
    const method = m[1].toUpperCase();
    const full = (base + (m[2] === '/' ? '' : m[2])).replace(/\/$/, '') || base;
    const mw = m[3];
    const roles = (mw.match(/checkRole\(([^)]*)\)/) || [])[1];
    const perms = (mw.match(/checkPermission\(([^)]*)\)/) || [])[1];
    routes.push({
      method, path: full, module: mod, unmounted: !!UNMOUNTED[mod],
      client: /verifyClientToken/.test(mw),
      roles: roles ? roles.replace(/['\s]/g, '').split(',') : null,
      perms: perms ? perms.replace(/['\s]/g, '').split(',') : null
    });
  }
}
// Endpoints defined directly in index.js
[
  ['GET', '/api/analytics/top-performers'], ['GET', '/api/analytics/summary'],
  ['GET', '/api/settings'], ['GET', '/api/audit']
].forEach(([method, p]) => routes.push({ method, path: p, module: 'index', roles: null, perms: null }));

// ---------------------------------------------------------------------------
// 0. Setup
// ---------------------------------------------------------------------------
const setup = folder('0. Setup', [
  req('Admin login', 'POST', '/api/auth/login', {
    pre: `
    pm.environment.set('run_id', String(Date.now()));
    ['staff_id','leader_id','staff_token','leader_token','client_token'].forEach(k => pm.environment.unset(k));
    `,
    body: json({ email: '{{admin_email}}', password: '{{admin_password}}', role: '{{admin_role}}' }),
    tests: expect(200, `
    const body = pm.response.json();
    pm.test('Token returned', () => pm.expect(body.token).to.be.a('string'));
    pm.environment.set('admin_token', body.token);
    pm.environment.set('admin_id', body.user && body.user.id);
    `)
  }),
  req('Create test employee (designer)', 'POST', '/api/users', {
    token: 'admin_token',
    pre: `pm.environment.set('test_password', 'Tt#' + pm.environment.get('run_id') + 'Aa9!x');`,
    body: json({ name: 'Postman Designer {{run_id}}', email: 'pm.designer.{{run_id}}@example.invalid', password: '{{test_password}}', role: 'designer' }),
    tests: expect(200, `pm.environment.set('staff_id', pm.response.json().id);`)
  }),
  req('Create test team leader', 'POST', '/api/users', {
    token: 'admin_token',
    body: json({ name: 'Postman Leader {{run_id}}', email: 'pm.leader.{{run_id}}@example.invalid', password: '{{test_password}}', role: 'team_leader' }),
    tests: expect(200, `pm.environment.set('leader_id', pm.response.json().id);`)
  }),
  req('Designer login', 'POST', '/api/auth/login', {
    body: json({ email: 'pm.designer.{{run_id}}@example.invalid', password: '{{test_password}}', role: 'designer' }),
    tests: expect(200, `pm.environment.set('staff_token', pm.response.json().token);`)
  }),
  req('Team leader login', 'POST', '/api/auth/login', {
    body: json({ email: 'pm.leader.{{run_id}}@example.invalid', password: '{{test_password}}', role: 'team_leader' }),
    tests: expect(200, `pm.environment.set('leader_token', pm.response.json().token);`)
  })
], 'Logs in as the admin from the environment and creates two throw-away accounts (a designer and a team leader, on @example.invalid addresses) that the rest of the run uses. They are soft-deleted in "8. Cleanup".');

// ---------------------------------------------------------------------------
// 1. Auth
// ---------------------------------------------------------------------------
const designerLogin = (extra) => json({ email: 'pm.designer.{{run_id}}@example.invalid', password: '{{test_password}}', ...extra });
const auth = folder('1. Auth - login and role check', [
  req('Login - missing role -> 400', 'POST', '/api/auth/login', {
    body: json({ email: 'pm.designer.{{run_id}}@example.invalid', password: '{{test_password}}' }),
    tests: expect(400, `pm.test('Asks for a role', () => pm.expect(pm.response.json().message).to.match(/role/i));`)
  }),
  req('Login - missing password -> 400', 'POST', '/api/auth/login', {
    body: json({ email: 'pm.designer.{{run_id}}@example.invalid', role: 'designer' }),
    tests: expect(400)
  }),
  req('Login - wrong password -> 401', 'POST', '/api/auth/login', {
    body: designerLogin({ password: 'Wrong-Password-123!', role: 'designer' }),
    tests: expect(401, `pm.test('Generic message', () => pm.expect(pm.response.json().message).to.eql('Invalid credentials'));`)
  }),
  req('Login - unknown email -> 401 (same message)', 'POST', '/api/auth/login', {
    body: json({ email: 'nobody.{{run_id}}@example.invalid', password: 'whatever', role: 'designer' }),
    tests: expect(401, `pm.test('Same message as wrong password', () => pm.expect(pm.response.json().message).to.eql('Invalid credentials'));`)
  }),
  req('Login - designer choosing Frontend role -> 403', 'POST', '/api/auth/login', {
    body: designerLogin({ role: 'frontend' }),
    tests: expect(403, `
    pm.test('Role mismatch message', () => pm.expect(pm.response.json().message).to.match(/role does not match/i));
    pm.test('No token issued', () => pm.expect(pm.response.json().token).to.be.undefined);
    `)
  }),
  req('Login - designer choosing Admin role -> 403', 'POST', '/api/auth/login', {
    body: designerLogin({ role: 'admin' }),
    tests: expect(403)
  }),
  req('Login - email is case-insensitive -> 200', 'POST', '/api/auth/login', {
    body: json({ email: 'PM.Designer.{{run_id}}@EXAMPLE.invalid', password: '{{test_password}}', role: 'designer' }),
    tests: expect(200, `pm.test('No password hash in response', () => pm.expect(pm.response.json().user).to.not.have.property('password'));`)
  }),
  req('Me - designer -> 200', 'GET', '/api/auth/me', {
    token: 'staff_token',
    tests: expect(200, `pm.test('Role is designer', () => pm.expect(pm.response.json().role).to.eql('designer'));`)
  }),
  req('Me - garbage token -> 401', 'GET', '/api/auth/me', {
    headers: [{ key: 'Authorization', value: 'Bearer not-a-real-token' }],
    tests: expect(401)
  }),
  req('Register user - designer not allowed -> 403', 'POST', '/api/auth/register', {
    token: 'staff_token',
    body: json({ name: 'x', email: 'x.{{run_id}}@example.invalid', password: 'Aa1!aaaaaaaaaa', role: 'admin' }),
    tests: expect(403)
  }),
  req('Invitations - list (admin) -> 200', 'GET', '/api/auth/invitations', { token: 'admin_token', tests: expect(200) }),
  req('Invite - unknown token -> 404', 'GET', '/api/auth/invite/postman-not-a-token', { tests: expect(404) })
]);

// ---------------------------------------------------------------------------
// 2. Security - no login (generated)
// ---------------------------------------------------------------------------
const unauthItems = routes
  .filter(r => !PUBLIC_OK.has(`${r.method} ${r.path}`))
  .map(r => req(`${r.method} ${r.path} -> 401`, r.method, fillParams(r.path), {
    body: ['POST', 'PUT', 'PATCH'].includes(r.method) ? json({}) : undefined,
    tests: expect(401)
  }));
unauthItems.push(
  req('GET /api/system/health (public) -> 200', 'GET', '/api/system/health', { tests: expect(200) }),
  req('GET /api/enterprise/health (public) -> 200', 'GET', '/api/enterprise/health', { tests: expect(200) }),
  req('Unknown API route -> 404 JSON (not the HTML app shell)', 'GET', '/api/postman-route-that-does-not-exist', {
    token: 'admin_token',
    tests: expect(404, `pm.test('JSON, not HTML', () => pm.expect(pm.response.headers.get('Content-Type') || '').to.include('application/json'));`)
  })
);
const security = folder('2. Security - endpoints require login', unauthItems,
  'Generated from backend/routes: every endpoint except login/invite/public portal ones must answer 401 without a token. Uses non-existent ids (999999) so nothing real is touched even if a check is missing.');

// ---------------------------------------------------------------------------
// 3. Security - role enforcement (generated)
// ---------------------------------------------------------------------------
const roleItems = routes
  .filter(r => !r.client && (r.roles || r.perms))
  .filter(r => {
    if (r.roles) return !r.roles.includes('designer');
    return !r.perms.some(p => DESIGNER_PERMISSIONS.includes(p));
  })
  .map(r => req(`${r.method} ${r.path} as designer -> 403`, r.method, fillParams(r.path), {
    token: 'staff_token',
    body: ['POST', 'PUT', 'PATCH'].includes(r.method) ? json({}) : undefined,
    tests: expect(403)
  }));
roleItems.push(
  req('Staff token on a client-portal route -> 403', 'GET', '/api/client-portal/home', { token: 'staff_token', tests: expect([401, 403]) })
);
const roleSec = folder('3. Security - role enforcement', roleItems,
  'Generated: every role/permission-restricted endpoint must answer 403 for the test designer account.');

// ---------------------------------------------------------------------------
// 4. Functional flows
// ---------------------------------------------------------------------------
const isArray = `pm.test('Returns a list', () => { const b = pm.response.json(); pm.expect(Array.isArray(b) || Array.isArray(b.data) || Array.isArray(b.rows) || Array.isArray(b.items)).to.be.true; });`;
const saveId = (v, field = 'id') => `pm.test('Returns ${field}', () => pm.expect(pm.response.json().${field}).to.exist); pm.environment.set('${v}', pm.response.json().${field});`;

const users = folder('4.01 Users', [
  req('List users -> 200', 'GET', '/api/users', { token: 'staff_token', tests: expect(200, isArray) }),
  req('List users filtered by role -> 200', 'GET', '/api/users?role=designer', { token: 'admin_token', tests: expect(200, `
  pm.test('Only designers', () => pm.response.json().forEach(u => pm.expect(u.role).to.eql('designer')));
  pm.test('No password hashes', () => pm.response.json().forEach(u => pm.expect(u).to.not.have.property('password')));
  `) }),
  req('Get user -> 200', 'GET', '/api/users/{{staff_id}}', { token: 'admin_token', pre: needs('staff_id'), tests: expect(200, `pm.test('No password hash', () => pm.expect(pm.response.json()).to.not.have.property('password'));`) }),
  req('Get user - unknown -> 404', 'GET', '/api/users/999999', { token: 'admin_token', tests: expect(404) }),
  req('Create user - weak password -> 400', 'POST', '/api/users', { token: 'admin_token', body: json({ name: 'Weak', email: 'weak.{{run_id}}@example.invalid', password: 'abc', role: 'designer' }), tests: expect(400) }),
  req('Create user - duplicate email -> 409', 'POST', '/api/users', { token: 'admin_token', body: json({ name: 'Dup', email: 'pm.designer.{{run_id}}@example.invalid', password: '{{test_password}}', role: 'designer' }), tests: expect(409) }),
  req('Update user (admin) -> 200', 'PUT', '/api/users/{{staff_id}}', { token: 'admin_token', pre: needs('staff_id'), body: json({ name: 'Postman Designer {{run_id}} (edited)', department: 'QA' }), tests: expect(200) }),
  req('Update own profile -> 200', 'PUT', '/api/users/me/profile', { token: 'staff_token', body: json({ bio: 'Created by the Postman test run', mobile: '9999999999' }), tests: expect(200) }),
  req('Designer cannot edit another user -> 403', 'PUT', '/api/users/{{leader_id}}', { token: 'staff_token', pre: needs('leader_id'), body: json({ role: 'admin' }), tests: expect(403) }),
  req('User performance -> 200', 'GET', '/api/users/{{staff_id}}/performance', { token: 'staff_token', pre: needs('staff_id'), tests: expect(200) }),
  req('User login history -> 200', 'GET', '/api/users/{{staff_id}}/logins', { token: 'admin_token', pre: needs('staff_id'), tests: expect(200, isArray) }),
  req('Lifecycle - invalid status -> 400', 'PUT', '/api/users/{{staff_id}}/lifecycle', { token: 'admin_token', pre: needs('staff_id'), body: json({ employment_status: 'not-a-status' }), tests: expect(400) }),
  req('Access scope -> 200', 'PUT', '/api/users/{{staff_id}}/scope', { token: 'admin_token', pre: needs('staff_id'), body: json({ scope_type: 'global' }), tests: expect(200) }),
  req('Reset password without OTP -> 400', 'PUT', '/api/users/{{staff_id}}/password', { token: 'admin_token', pre: needs('staff_id'), body: json({ password: 'Another#Pass123' }), tests: expect(400) })
]);

const teams = folder('4.02 Teams', [
  req('Create team -> 200', 'POST', '/api/teams', { token: 'admin_token', body: json({ name: 'Postman Team {{run_id}}', description: 'test', leader_id: '{{leader_id}}', member_ids: ['{{staff_id}}', '{{leader_id}}'] }), tests: expect(200, saveId('team_id')) }),
  req('Create team - duplicate -> 409', 'POST', '/api/teams', { token: 'admin_token', body: json({ name: 'Postman Team {{run_id}}' }), tests: expect(409) }),
  req('Create team - no name -> 400', 'POST', '/api/teams', { token: 'admin_token', body: json({ name: ' ' }), tests: expect(400) }),
  req('List teams -> 200', 'GET', '/api/teams', { token: 'staff_token', tests: expect(200, isArray) }),
  req('Get team -> 200', 'GET', '/api/teams/{{team_id}}', { token: 'staff_token', pre: needs('team_id'), tests: expect(200) }),
  req('Update team -> 200', 'PUT', '/api/teams/{{team_id}}', { token: 'admin_token', pre: needs('team_id'), body: json({ description: 'updated by postman', member_ids: ['{{staff_id}}', '{{leader_id}}'] }), tests: expect(200) })
]);

const clients = folder('4.03 Clients & Client Connect', [
  req('Create client -> 200', 'POST', '/api/clients', { token: 'admin_token', body: json({ name: 'Postman Client {{run_id}}', company: 'Postman Co {{run_id}}', email: 'pm.client.{{run_id}}@example.invalid', team_leader_id: '{{leader_id}}' }), tests: expect(200, saveId('client_id')) }),
  req('Create client - no name -> 400', 'POST', '/api/clients', { token: 'admin_token', body: json({ company: 'x' }), tests: expect(400) }),
  req('List clients -> 200', 'GET', '/api/clients', { token: 'staff_token', tests: expect(200, isArray) }),
  req('SECURITY: client records never include password hashes', 'GET', '/api/clients/{{client_id}}', { token: 'staff_token', pre: needs('client_id'), tests: expect(200, `
  pm.test('No password_hash / portal_password fields', () => { const c = pm.response.json(); pm.expect(c).to.not.have.property('password_hash'); pm.expect(c).to.not.have.property('portal_password'); });
  pm.test('No bcrypt hash anywhere in the response', () => pm.expect(pm.response.text()).to.not.match(/\\$2[aby]\\$\\d\\d\\$/));
  `) }),
  req('Get client -> 200', 'GET', '/api/clients/{{client_id}}', { token: 'admin_token', pre: needs('client_id'), tests: expect(200) }),
  req('Get client - unknown -> 404', 'GET', '/api/clients/999999', { token: 'admin_token', tests: expect(404) }),
  req('Update client -> 200', 'PUT', '/api/clients/{{client_id}}', { token: 'admin_token', pre: needs('client_id'), body: json({ industry: 'Testing', budget: '1000' }), tests: expect(200) }),
  req('Client feedback score -> 200', 'POST', '/api/clients/{{client_id}}/feedback', { token: 'admin_token', pre: needs('client_id'), body: json({ score: 4 }), tests: expect(200) }),
  req('Client feedback - invalid score -> 400', 'POST', '/api/clients/{{client_id}}/feedback', { token: 'admin_token', pre: needs('client_id'), body: json({ score: 9 }), tests: expect(400) }),
  req('Provision client portal login -> 200', 'POST', '/api/clients/{{client_id}}/provision-login', { token: 'admin_token', pre: needs('client_id'), tests: expect(200, `
  const b = pm.response.json();
  pm.environment.set('client_login_id', b.client_login_id);
  pm.environment.set('client_temp_password', b.temp_password);
  `) }),
  req('Create second client (for isolation tests) -> 200', 'POST', '/api/clients', { token: 'admin_token', body: json({ name: 'Postman Client B {{run_id}}', company: 'Postman B Co {{run_id}}', email: 'pm.clientb.{{run_id}}@example.invalid' }), tests: expect(200, saveId('client_b_id')) }),
  req('Provision second client login -> 200', 'POST', '/api/clients/{{client_b_id}}/provision-login', { token: 'admin_token', pre: needs('client_b_id'), tests: expect(200, `
  pm.environment.set('client_b_login_id', pm.response.json().client_login_id);
  pm.environment.set('client_b_password', pm.response.json().temp_password);
  `) }),
  req('Client Connect summary -> 200', 'GET', '/api/client-connect/summary', { token: 'admin_token', tests: expect(200) }),
  req('Create portal pass -> 200', 'POST', '/api/client-connect/portal-pass', { token: 'admin_token', pre: needs('client_id'), body: json({ client_id: '{{client_id}}', hours: 1 }), tests: expect(200, `pm.environment.set('portal_pass', pm.response.json().token);`) }),
  req('Verify portal pass -> 200', 'POST', '/api/client-connect/verify-pass', { pre: needs('portal_pass'), body: json({ token: '{{portal_pass}}' }), tests: expect(200, `pm.test('Valid', () => pm.expect(pm.response.json().valid).to.be.true);`) }),
  req('Verify portal pass - bogus -> 401', 'POST', '/api/client-connect/verify-pass', { body: json({ token: 'not-a-pass-{{run_id}}' }), tests: expect([400, 401]) }),
  req('Portal data with pass -> 200', 'GET', '/api/client-connect/portal-data?token={{portal_pass}}', { pre: needs('portal_pass'), tests: expect(200) }),
  req('List passes -> 200', 'GET', '/api/client-connect/passes/{{client_id}}', { token: 'admin_token', pre: needs('client_id'), tests: expect(200, isArray) }),
  req('Log interaction -> 200', 'POST', '/api/client-connect/interactions', { token: 'admin_token', pre: needs('client_id'), body: json({ client_id: '{{client_id}}', type: 'Call', notes: 'Postman test call', sentiment: 'Positive' }), tests: expect(200) }),
  req('List interactions -> 200', 'GET', '/api/client-connect/interactions/{{client_id}}', { token: 'admin_token', pre: needs('client_id'), tests: expect(200, `pm.test('Has the logged interaction', () => pm.expect(pm.response.json().length).to.be.at.least(1));`) })
]);

const projects = folder('4.04 Projects', [
  req('Create project -> 200', 'POST', '/api/projects', { token: 'admin_token', body: json({ title: 'Postman Project {{run_id}}', description: 'test', priority: 'normal', deadline: '2099-12-31', team_leader_id: '{{leader_id}}', client_id: '{{client_id}}', team_members: ['{{staff_id}}'] }), tests: expect(200, saveId('project_id')) }),
  req('Create project - no title -> 400', 'POST', '/api/projects', { token: 'admin_token', body: json({ description: 'x' }), tests: expect(400) }),
  req('List projects -> 200', 'GET', '/api/projects', { token: 'staff_token', tests: expect(200, isArray) }),
  req('List active projects -> 200', 'GET', '/api/projects?status=active', { token: 'admin_token', tests: expect(200, isArray) }),
  req('Search projects -> finds it', 'GET', '/api/projects?search=Postman%20Project%20{{run_id}}', { token: 'admin_token', pre: needs('project_id'), tests: expect(200, `pm.test('Found by search', () => pm.expect(pm.response.json().map(p => String(p.id))).to.include(String(pm.environment.get('project_id'))));`) }),
  req('Get project -> 200', 'GET', '/api/projects/{{project_id}}', { token: 'staff_token', pre: needs('project_id'), tests: expect(200) }),
  req('Get project - unknown -> 404', 'GET', '/api/projects/999999', { token: 'admin_token', tests: expect(404) }),
  req('Update project (leader) -> 200', 'PUT', '/api/projects/{{project_id}}', { token: 'leader_token', pre: needs('project_id'), body: json({ description: 'updated by leader', priority: 'urgent' }), tests: expect(200) }),
  req('Archive project -> 200', 'POST', '/api/projects/{{project_id}}/archive', { token: 'admin_token', pre: needs('project_id'), tests: expect(200) }),
  req('Restore project -> 200', 'POST', '/api/projects/{{project_id}}/restore', { token: 'admin_token', pre: needs('project_id'), tests: expect(200) }),
  req('Bulk status - invalid -> 400', 'POST', '/api/projects/bulk-status', { token: 'admin_token', body: json({ ids: ['{{project_id}}'], status: 'nonsense' }), tests: expect(400) }),
  req('Bulk status -> 200', 'POST', '/api/projects/bulk-status', { token: 'admin_token', pre: needs('project_id'), body: json({ ids: ['{{project_id}}'], status: 'active' }), tests: expect(200) })
]);

const tasks = folder('4.05 Tasks', [
  req('Create task -> 200', 'POST', '/api/tasks', { token: 'admin_token', pre: needs('project_id'), body: json({ project_id: '{{project_id}}', title: 'Postman Task {{run_id}}', description: 'test', assigned_to: '{{staff_id}}', role_required: 'designer', priority: 'normal', deadline: '2099-12-31', task_members: ['{{staff_id}}'] }), tests: expect(200, saveId('task_id')) }),
  req('Create task - missing title -> 400', 'POST', '/api/tasks', { token: 'admin_token', body: json({ project_id: '{{project_id}}' }), tests: expect(400) }),
  req('List tasks -> 200', 'GET', '/api/tasks', { token: 'staff_token', tests: expect(200, isArray) }),
  req('List tasks for project -> 200', 'GET', '/api/tasks?project_id={{project_id}}', { token: 'admin_token', pre: needs('project_id'), tests: expect(200, `pm.test('Contains the new task', () => pm.expect(pm.response.json().map(t => String(t.id))).to.include(String(pm.environment.get('task_id'))));`) }),
  req('Search tasks -> finds it', 'GET', '/api/tasks?search=Postman%20Task%20{{run_id}}', { token: 'admin_token', pre: needs('task_id'), tests: expect(200, `pm.test('Found by search', () => pm.expect(pm.response.json().map(t => String(t.id))).to.include(String(pm.environment.get('task_id'))));`) }),
  req('Project tasks -> 200', 'GET', '/api/projects/{{project_id}}/tasks', { token: 'staff_token', pre: needs('project_id'), tests: expect(200, isArray) }),
  req('Get task -> 200', 'GET', '/api/tasks/{{task_id}}', { token: 'staff_token', pre: needs('task_id'), tests: expect(200) }),
  req('Start task (assignee) -> 200', 'PUT', '/api/tasks/{{task_id}}/start', { token: 'staff_token', pre: needs('task_id'), tests: expect(200) }),
  req('Start task (not assignee) -> 404', 'PUT', '/api/tasks/{{task_id}}/start', { token: 'leader_token', pre: needs('task_id'), tests: expect(404) }),
  req('Update task (admin) -> 200', 'PUT', '/api/tasks/{{task_id}}', { token: 'admin_token', pre: needs('task_id'), body: json({ priority: 'urgent', description: 'updated' }), tests: expect(200) }),
  req('Send task for rework (leader) -> 200', 'POST', '/api/tasks/{{task_id}}/rework', { token: 'leader_token', pre: needs('task_id'), tests: expect(200) }),
  req('Bulk action - empty -> 400', 'POST', '/api/tasks/bulk-action', { token: 'admin_token', body: json({ ids: [] }), tests: expect(400) }),
  req('Bulk action -> 200', 'POST', '/api/tasks/bulk-action', { token: 'admin_token', pre: needs('task_id'), body: json({ ids: ['{{task_id}}'], status: 'in_progress' }), tests: expect(200) })
]);

const submissions = folder('4.06 Submissions', [
  req('Submit work for task -> 200', 'POST', '/api/submissions', { token: 'staff_token', pre: needs('task_id'), body: json({ task_id: '{{task_id}}', content_text: 'Postman test submission', external_link: 'https://example.com/design' }), tests: expect(200, saveId('submission_id')) }),
  req('Submit - no task or project -> 400', 'POST', '/api/submissions', { token: 'staff_token', body: json({ content_text: 'x' }), tests: expect(400) }),
  req('Submit - invalid link -> 400', 'POST', '/api/submissions', { token: 'staff_token', body: json({ project_name: 'Report {{run_id}}', external_link: 'javascript:alert(1)' }), tests: expect(400) }),
  req('List submissions -> 200', 'GET', '/api/submissions', { token: 'admin_token', tests: expect(200) }),
  req('List submissions - bad status filter -> 400', 'GET', '/api/submissions?status=hacked', { token: 'admin_token', tests: expect(400) }),
  req('Get submission -> 200', 'GET', '/api/submissions/{{submission_id}}', { token: 'staff_token', pre: needs('submission_id'), tests: expect(200) }),
  req('Admin review before leader -> 409', 'PUT', '/api/submissions/{{submission_id}}/admin-review', { token: 'admin_token', pre: needs('submission_id'), body: json({ status: 'approved' }), tests: expect(409) }),
  req('Leader review - invalid status -> 400', 'PUT', '/api/submissions/{{submission_id}}/leader-review', { token: 'leader_token', pre: needs('submission_id'), body: json({ status: 'maybe' }), tests: expect(400) }),
  req('Leader review: rework -> 200', 'PUT', '/api/submissions/{{submission_id}}/leader-review', { token: 'leader_token', pre: needs('submission_id'), body: json({ status: 'rework', note: 'Postman: please adjust' }), tests: expect(200) }),
  req('Manual report submission -> 200', 'POST', '/api/submissions', { token: 'staff_token', body: json({ project_name: 'Postman Weekly Report {{run_id}}', content_text: 'Weekly report body' }), tests: expect(200, saveId('report_id')) }),
  req('Another employee cannot delete my report -> 403', 'DELETE', '/api/submissions/{{report_id}}', { token: 'leader_token', pre: needs('report_id'), tests: expect(403) }),
  req('Delete own report -> 200', 'DELETE', '/api/submissions/{{report_id}}', { token: 'staff_token', pre: needs('report_id'), tests: expect(200) })
]);

const portal = folder('4.07 Client Portal (client login)', [
  req('Client login with ID + password -> 200', 'POST', '/api/client-portal/login', { pre: needs('client_login_id'), body: json({ client_login_id: '{{client_login_id}}', password: '{{client_temp_password}}' }), tests: expect(200, `pm.environment.set('client_token', pm.response.json().token);`) }),
  req('SECURITY: client login with WRONG password -> 401', 'POST', '/api/client-portal/login', { pre: needs('client_login_id'), body: json({ client_login_id: '{{client_login_id}}', password: 'Wrong-Password-1!' }), tests: expect(401, `pm.test('No token issued', () => pm.expect(pm.response.json().token).to.be.undefined);`) }),
  req('SECURITY: client login with NO password -> 400/401', 'POST', '/api/client-portal/login', { pre: needs('client_login_id'), body: json({ client_login_id: '{{client_login_id}}' }), tests: expect([400, 401], `pm.test('No token issued', () => pm.expect(pm.response.json().token).to.be.undefined);`) }),
  req('SECURITY: client login by numeric id (even with the right password) -> 401', 'POST', '/api/client-portal/login', { pre: needs('client_id', 'client_temp_password'), body: json({ client_login_id: '{{client_id}}', password: '{{client_temp_password}}' }), tests: expect(401, `pm.test('No token issued', () => pm.expect(pm.response.json().token).to.be.undefined);`) }),
  req('SECURITY: client login by company name -> 401', 'POST', '/api/client-portal/login', { pre: needs('client_temp_password'), body: json({ client_login_id: 'Postman Co {{run_id}}', password: '{{client_temp_password}}' }), tests: expect(401) }),
  req('Client login by email + password -> 200', 'POST', '/api/client-portal/login', { pre: needs('client_temp_password'), body: json({ client_login_id: 'pm.client.{{run_id}}@example.invalid', password: '{{client_temp_password}}' }), tests: expect(200) }),
  req('Client home -> 200', 'GET', '/api/client-portal/home', { token: 'client_token', pre: needs('client_token'), tests: expect(200) }),
  req('Client workspace -> 200', 'GET', '/api/client-portal/workspace', { token: 'client_token', pre: needs('client_token'), tests: expect(200) }),
  req('Client channels -> 200', 'GET', '/api/client-portal/channels', { token: 'client_token', pre: needs('client_token'), tests: expect(200) }),
  req('Client creates project group -> 200', 'POST', '/api/client-portal/groups', { token: 'client_token', pre: needs('client_token', 'project_id'), body: json({ title: 'Postman Group {{run_id}}', project_id: '{{project_id}}' }), tests: expect(200, `
  const b = pm.response.json();
  const id = b.conversationId;
  pm.test('Returns conversation id', () => pm.expect(id).to.exist);
  pm.environment.set('client_conversation_id', id);
  `) }),
  req('Client sends message -> 200', 'POST', '/api/client-portal/messages', { token: 'client_token', pre: needs('client_token', 'client_conversation_id'), body: json({ conversation_id: '{{client_conversation_id}}', message: 'Hello from Postman client' }), tests: expect(200) }),
  req('Client sends empty message -> 400', 'POST', '/api/client-portal/messages', { token: 'client_token', pre: needs('client_token'), body: json({ message: '  ' }), tests: expect(400) }),
  req('Client reads messages -> 200', 'GET', '/api/client-portal/messages?conversation_id={{client_conversation_id}}', { token: 'client_token', pre: needs('client_token', 'client_conversation_id'), tests: expect(200) }),
  req('Client opens a ticket -> 200', 'POST', '/api/client-portal/tickets', { token: 'client_token', pre: needs('client_token'), body: json({ title: 'Postman client ticket {{run_id}}', description: 'test', priority: 'low' }), tests: expect(200) }),
  req('Client tickets -> 200', 'GET', '/api/client-portal/tickets', { token: 'client_token', pre: needs('client_token'), tests: expect(200) }),
  req('Client payments -> 200', 'GET', '/api/client-portal/payments', { token: 'client_token', pre: needs('client_token'), tests: expect(200) }),
  req('Client reviews -> 200', 'GET', '/api/client-portal/reviews', { token: 'client_token', pre: needs('client_token'), tests: expect(200) }),
  req('Client meetings -> 200', 'GET', '/api/client-portal/meetings', { token: 'client_token', pre: needs('client_token'), tests: expect(200) }),
  req('Client review - rating out of range -> 400', 'POST', '/api/client-portal/reviews', { token: 'client_token', pre: needs('client_token', 'project_id'), body: json({ project_id: '{{project_id}}', rating: 9 }), tests: expect(400) }),
  req('Client change password - weak -> 400', 'POST', '/api/client-portal/change-password', { token: 'client_token', pre: needs('client_token'), body: json({ password: 'weak' }), tests: expect(400) }),
  req('Client token on a staff route -> 403', 'GET', '/api/users', { token: 'client_token', pre: needs('client_token'), tests: expect(403) }),
  // Cross-client isolation: client B must never see or touch client A's data.
  req('Second client login -> 200', 'POST', '/api/client-portal/login', { pre: needs('client_b_login_id'), body: json({ client_login_id: '{{client_b_login_id}}', password: '{{client_b_password}}' }), tests: expect(200, `pm.environment.set('client_b_token', pm.response.json().token);`) }),
  req('ISOLATION: client B cannot read client A\'s chat -> 403', 'GET', '/api/client-portal/messages?conversation_id={{client_conversation_id}}', { token: 'client_b_token', pre: needs('client_b_token', 'client_conversation_id'), tests: expect(403) }),
  req('ISOLATION: client B cannot post in client A\'s chat -> 403', 'POST', '/api/client-portal/messages', { token: 'client_b_token', pre: needs('client_b_token', 'client_conversation_id'), body: json({ conversation_id: '{{client_conversation_id}}', message: 'intrusion attempt' }), tests: expect(403) }),
  req('ISOLATION: client B cannot use client A\'s project -> 403', 'POST', '/api/client-portal/groups', { token: 'client_b_token', pre: needs('client_b_token', 'project_id'), body: json({ title: 'Intrusion {{run_id}}', project_id: '{{project_id}}' }), tests: expect(403) }),
  req('ISOLATION: client B cannot review client A\'s project -> 403', 'POST', '/api/client-portal/reviews', { token: 'client_b_token', pre: needs('client_b_token', 'project_id'), body: json({ project_id: '{{project_id}}', rating: 1 }), tests: expect(403) }),
  req('ISOLATION: client B sees none of client A\'s data', 'GET', '/api/client-portal/workspace', { token: 'client_b_token', pre: needs('client_b_token'), tests: expect(200, `
  const text = pm.response.text();
  pm.test('No client A project, ticket or messages in B\\'s workspace', () => {
    pm.expect(text).to.not.include('Postman Project ' + pm.environment.get('run_id'));
    pm.expect(text).to.not.include('Hello from Postman client');
  });
  `) }),
  req('ISOLATION: client B\'s tickets exclude client A\'s', 'GET', '/api/client-portal/tickets', { token: 'client_b_token', pre: needs('client_b_token'), tests: expect(200, `pm.test('No client A ticket', () => pm.expect(pm.response.text()).to.not.include('Postman client ticket ' + pm.environment.get('run_id')));`) }),
  req('ISOLATION: client B\'s channels exclude client A\'s', 'GET', '/api/client-portal/channels', { token: 'client_b_token', pre: needs('client_b_token'), tests: expect(200, `pm.test('No client A group', () => pm.expect(pm.response.text()).to.not.include('Postman Group ' + pm.environment.get('run_id')));`) })
]);

const clientReports = folder('4.08 Client Reports', [
  req('Summary -> 200', 'GET', '/api/client-reports/summary', { token: 'admin_token', tests: expect(200) }),
  req('Reviews -> 200', 'GET', '/api/client-reports/reviews', { token: 'admin_token', tests: expect(200) }),
  req('Meetings -> 200', 'GET', '/api/client-reports/meetings', { token: 'admin_token', tests: expect(200) }),
  req('Schedule meeting - missing fields -> 400', 'POST', '/api/client-reports/meetings', { token: 'admin_token', body: json({ title: 'x' }), tests: expect(400) }),
  req('Schedule meeting with client -> 200', 'POST', '/api/client-reports/meetings', { token: 'admin_token', pre: needs('client_id'), body: json({ client_id: '{{client_id}}', title: 'Postman sync {{run_id}}', scheduled_at: '2099-01-01T10:00:00Z', meeting_link: 'https://example.com/meet' }), tests: expect(200, saveId('meeting_id', 'meetingId')) }),
  req('Update meeting status -> 200', 'PUT', '/api/client-reports/meetings/{{meeting_id}}/status', { token: 'admin_token', pre: needs('meeting_id'), body: json({ status: 'confirmed' }), tests: expect(200) }),
  req('Update meeting - no status -> 400', 'PUT', '/api/client-reports/meetings/{{meeting_id}}/status', { token: 'admin_token', pre: needs('meeting_id'), body: json({}), tests: expect(400) })
]);

const messages = folder('4.09 Messages', [
  req('Chat users -> 200', 'GET', '/api/messages/users', { token: 'staff_token', tests: expect(200, isArray) }),
  req('Chat teams -> 200', 'GET', '/api/messages/teams', { token: 'staff_token', tests: expect(200) }),
  req('Chat clients -> 200', 'GET', '/api/messages/clients', { token: 'admin_token', tests: expect(200) }),
  req('Start conversation - nobody selected -> 400', 'POST', '/api/messages/conversations', { token: 'staff_token', body: json({ participant_ids: [] }), tests: expect(400) }),
  req('Designer starts chat with leader -> 200', 'POST', '/api/messages/conversations', { token: 'staff_token', pre: needs('leader_id'), body: json({ participant_ids: ['{{leader_id}}'] }), tests: expect(200, `pm.environment.set('conversation_id', pm.response.json().conversation.id);`) }),
  req('Send message -> 200', 'POST', '/api/messages/conversations/{{conversation_id}}/messages', { token: 'staff_token', pre: needs('conversation_id'), body: json({ message: 'Hello from Postman {{run_id}}' }), tests: expect(200) }),
  req('Send empty message -> 400', 'POST', '/api/messages/conversations/{{conversation_id}}/messages', { token: 'staff_token', pre: needs('conversation_id'), body: json({ message: ' ' }), tests: expect(400) }),
  req('Leader reads messages -> 200', 'GET', '/api/messages/conversations/{{conversation_id}}/messages', { token: 'leader_token', pre: needs('conversation_id'), tests: expect(200, `pm.test('Has the message', () => pm.expect(JSON.stringify(pm.response.json())).to.include('Hello from Postman'));`) }),
  req('Search messages -> 200', 'GET', '/api/messages/conversations/{{conversation_id}}/search?q=Postman', { token: 'staff_token', pre: needs('conversation_id'), tests: expect(200) }),
  req('Mark read -> 200', 'PUT', '/api/messages/conversations/{{conversation_id}}/read', { token: 'leader_token', pre: needs('conversation_id'), tests: expect(200) }),
  req('Typing indicator -> 200', 'POST', '/api/messages/conversations/{{conversation_id}}/typing', { token: 'staff_token', pre: needs('conversation_id'), body: json({ isTyping: true }), tests: expect(200) }),
  req('My conversations -> 200', 'GET', '/api/messages/conversations', { token: 'staff_token', tests: expect(200) }),
  req('Outsider reads conversation -> 403', 'GET', '/api/messages/conversations/{{conversation_id}}/messages', { token: 'client_token', pre: needs('conversation_id', 'client_token'), tests: expect(403) }),
  req('Team conversation -> 200', 'POST', '/api/messages/conversations/team/{{team_id}}', { token: 'admin_token', pre: needs('team_id'), tests: expect(200, `pm.environment.set('team_conversation_id', pm.response.json().conversation.id);`) }),
  req('Client conversation -> 200', 'POST', '/api/messages/conversations/client/{{client_id}}', { token: 'admin_token', pre: needs('client_id'), tests: expect(200) }),
  req('Designer chats with admin (for outsider test) -> 200', 'POST', '/api/messages/conversations', { token: 'staff_token', pre: needs('admin_id'), body: json({ participant_ids: ['{{admin_id}}'], title: 'Postman private {{run_id}}' }), tests: expect(200, `pm.environment.set('private_conversation_id', pm.response.json().conversation.id);`) }),
  req('SECURITY: non-member clears someone else\'s chat -> 403', 'DELETE', '/api/messages/conversations/{{private_conversation_id}}/clear', { token: 'leader_token', pre: needs('private_conversation_id'), tests: expect(403) }),
  req('SECURITY: non-member deletes someone else\'s chat -> 403', 'DELETE', '/api/messages/conversations/{{private_conversation_id}}', { token: 'leader_token', pre: needs('private_conversation_id'), tests: expect(403) })
]);

const payments = folder('4.10 Payments', [
  req('Record payment (admin) -> 200', 'POST', '/api/payments', { token: 'admin_token', body: json({ user_id: '{{staff_id}}', amount: 1, currency: 'INR', payment_date: '2099-01-01', method: 'test', notes: 'Postman test payment {{run_id}}', status: 'pending' }), tests: expect(200, saveId('payment_id')) }),
  req('Record payment - no amount -> 400', 'POST', '/api/payments', { token: 'admin_token', body: json({ user_id: '{{staff_id}}' }), tests: expect(400) }),
  req('List payments (admin) -> 200', 'GET', '/api/payments', { token: 'admin_token', tests: expect(200, isArray) }),
  req('Client payments -> 200', 'GET', '/api/payments/client/{{client_id}}', { token: 'admin_token', pre: needs('client_id'), tests: expect(200) }),
  req('Update payment (admin) -> 200', 'PUT', '/api/payments/{{payment_id}}', { token: 'admin_token', pre: needs('payment_id'), body: json({ status: 'paid' }), tests: expect(200) }),
  req('SECURITY: designer sees only own payments', 'GET', '/api/payments', { token: 'leader_token', tests: `
  pm.test('Status 200 or 403', () => pm.expect([200, 403]).to.include(pm.response.code));
  if (pm.response.code === 200) {
    const me = String(pm.environment.get('leader_id'));
    pm.test('No other employees\\' payments listed', () => pm.response.json().forEach(p => pm.expect(String(p.user_id)).to.eql(me)));
  }
  ` }),
  req('SECURITY: employee cannot create payments -> 403', 'POST', '/api/payments', { token: 'staff_token', body: json({ user_id: '{{staff_id}}', amount: 1000000, notes: 'Postman self-pay attempt' }), tests: expect(403, `
  if (pm.response.code === 200) pm.environment.set('rogue_payment_id', pm.response.json().id);
  `) }),
  req('SECURITY: employee cannot edit a payment -> 403', 'PUT', '/api/payments/{{payment_id}}', { token: 'staff_token', pre: needs('payment_id'), body: json({ amount: 999999 }), tests: expect(403) }),
  req('SECURITY: employee cannot delete a payment -> 403', 'DELETE', '/api/payments/{{payment_id}}', { token: 'staff_token', pre: needs('payment_id'), tests: expect(403) })
]);

const tickets = folder('4.11 Tickets (help desk)', [
  req('Open ticket -> 200', 'POST', '/api/tickets', { token: 'staff_token', body: json({ title: 'Postman ticket {{run_id}}', description: 'test', priority: 'low', category: 'IT' }), tests: expect(200, saveId('ticket_id')) }),
  req('Open ticket - no title -> 400', 'POST', '/api/tickets', { token: 'staff_token', body: json({ description: 'x' }), tests: expect(400) }),
  req('My tickets -> 200', 'GET', '/api/tickets', { token: 'staff_token', tests: expect(200, isArray) }),
  req('All tickets (admin) -> 200', 'GET', '/api/tickets', { token: 'admin_token', tests: expect(200, isArray) }),
  req('Admin assigns/updates ticket -> 200', 'PUT', '/api/tickets/{{ticket_id}}', { token: 'admin_token', pre: needs('ticket_id'), body: json({ status: 'in_progress', assigned_to: '{{admin_id}}' }), tests: expect(200) }),
  req('SECURITY: another employee cannot edit my ticket -> 403', 'PUT', '/api/tickets/{{ticket_id}}', { token: 'leader_token', pre: needs('ticket_id'), body: json({ status: 'closed' }), tests: expect(403) }),
  req('SECURITY: another employee cannot delete my ticket -> 403', 'DELETE', '/api/tickets/{{ticket_id}}', { token: 'leader_token', pre: needs('ticket_id'), tests: expect(403) })
]);

const courses = folder('4.12 Learning Hub (courses)', [
  req('Add course -> 200', 'POST', '/api/courses', { token: 'admin_token', body: json({ title: 'Postman Course {{run_id}}', description: 'test', link: 'https://example.com/course' }), tests: expect(200, saveId('course_id')) }),
  req('Add course - no title -> 400', 'POST', '/api/courses', { token: 'admin_token', body: json({ link: 'https://example.com' }), tests: expect(400) }),
  req('List courses -> 200', 'GET', '/api/courses', { token: 'staff_token', tests: expect(200, isArray) }),
  req('Filter courses by team/user/project -> 200', 'GET', '/api/courses?team=1&user=1&project=1', { token: 'staff_token', tests: expect(200, isArray) }),
  req('SECURITY: employee cannot delete a course -> 403', 'DELETE', '/api/courses/{{course_id}}', { token: 'staff_token', pre: needs('course_id'), tests: expect(403) })
]);

const notifications = folder('4.13 Notifications', [
  req('My notifications -> 200', 'GET', '/api/notifications', { token: 'staff_token', tests: expect(200, `
  ${isArray}
  const first = pm.response.json()[0];
  if (first) pm.environment.set('notification_id', first.id);
  pm.test('Received the project/task assignment notifications', () => pm.expect(pm.response.json().length).to.be.at.least(1));
  `) }),
  req('Mark one read -> 200', 'PUT', '/api/notifications/{{notification_id}}/read', { token: 'staff_token', pre: needs('notification_id'), tests: expect(200) }),
  req('Mark all read -> 200', 'PUT', '/api/notifications/read-all', { token: 'staff_token', tests: expect(200) }),
  req('All read now', 'GET', '/api/notifications', { token: 'staff_token', tests: expect(200, `pm.test('No unread left', () => pm.response.json().forEach(n => pm.expect(Number(n.is_read)).to.eql(1)));`) })
]);

const workspace = folder('4.14 Creative Workspace (whiteboards)', [
  req('Save new whiteboard -> 200', 'POST', '/api/workspace/save', { token: 'staff_token', body: json({ title: 'Postman Board {{run_id}}', content_json: '{"objects":[]}' }), tests: expect(200, saveId('whiteboard_id')) }),
  req('Save - title over 200 chars -> 400', 'POST', '/api/workspace/save', { token: 'staff_token', body: json({ title: 'x'.repeat(201) }), tests: expect(400) }),
  req('Update whiteboard -> 200', 'POST', '/api/workspace/save', { token: 'staff_token', pre: needs('whiteboard_id'), body: json({ id: '{{whiteboard_id}}', title: 'Postman Board {{run_id}} v2', content_json: '{"objects":[1]}' }), tests: expect(200) }),
  req('List whiteboards -> 200', 'GET', '/api/workspace', { token: 'staff_token', tests: expect(200) }),
  req('Get whiteboard -> 200', 'GET', '/api/workspace/{{whiteboard_id}}', { token: 'staff_token', pre: needs('whiteboard_id'), tests: expect(200) }),
  req('Another employee cannot open it -> 403', 'GET', '/api/workspace/{{whiteboard_id}}', { token: 'leader_token', pre: needs('whiteboard_id'), tests: expect(403) }),
  req('Another employee cannot overwrite it -> 403', 'POST', '/api/workspace/save', { token: 'leader_token', pre: needs('whiteboard_id'), body: json({ id: '{{whiteboard_id}}', title: 'hijack' }), tests: expect(403) }),
  req('Get whiteboard - invalid id -> 400', 'GET', '/api/workspace/abc', { token: 'staff_token', tests: expect(400) })
]);

const driveItems = [
  req('List root -> 200', 'GET', '/api/drive/items', { token: 'staff_token', tests: expect(200, isArray) }),
  req('Create folder -> 200', 'POST', '/api/drive/folder', { token: 'staff_token', body: json({ name: 'Postman Drive {{run_id}}', parentId: null }), tests: expect(200, saveId('folder_id')) }),
  req('Create sub-folder -> 200', 'POST', '/api/drive/folder', { token: 'staff_token', pre: needs('folder_id'), body: json({ name: 'Designs', parentId: '{{folder_id}}' }), tests: expect(200, saveId('subfolder_id')) }),
  req('Create folder - empty name -> 400', 'POST', '/api/drive/folder', { token: 'staff_token', body: json({ name: ' ', parentId: null }), tests: expect(400) }),
  req('Create folder - slash in name -> 400', 'POST', '/api/drive/folder', { token: 'staff_token', body: json({ name: 'a/b', parentId: null }), tests: expect(400) }),
  req('Create folder - missing parent -> 404', 'POST', '/api/drive/folder', { token: 'staff_token', body: json({ name: 'Orphan', parentId: 999999999 }), tests: expect(404) }),
  req('Upload Folder: create tree -> 200', 'POST', '/api/drive/folders/ensure', { token: 'staff_token', pre: needs('folder_id'), body: json({ parentId: '{{folder_id}}', paths: ['Website/assets/img', 'Website/src', 'Designs'] }), tests: expect(200, `
  const f = pm.response.json().folders;
  pm.test('Creates every ancestor', () => pm.expect(f).to.have.all.keys('Website', 'Website/assets', 'Website/assets/img', 'Website/src', 'Designs'));
  pm.test('Reuses existing "Designs"', () => pm.expect(String(f['Designs'])).to.eql(String(pm.environment.get('subfolder_id'))));
  pm.environment.set('img_folder_id', f['Website/assets/img']);
  `) }),
  req('Upload Folder: re-run merges -> same ids', 'POST', '/api/drive/folders/ensure', { token: 'staff_token', pre: needs('folder_id'), body: json({ parentId: '{{folder_id}}', paths: ['Website/assets/img'] }), tests: expect(200, `pm.test('Same id', () => pm.expect(String(pm.response.json().folders['Website/assets/img'])).to.eql(String(pm.environment.get('img_folder_id'))));`) }),
  req('Upload Folder: path traversal -> 400', 'POST', '/api/drive/folders/ensure', { token: 'staff_token', body: json({ parentId: null, paths: ['a/../../etc'] }), tests: expect(400) }),
  req('Upload file (form-data) -> 200', 'POST', '/api/drive/upload', {
    token: 'staff_token', pre: needs('img_folder_id'),
    body: { mode: 'formdata', formdata: [{ key: 'parentId', value: '{{img_folder_id}}', type: 'text' }, { key: 'file', type: 'file', src: 'fixtures/sample-upload.txt' }] },
    description: 'If Postman shows the file as missing, re-select postman/fixtures/sample-upload.txt in the Body tab.',
    tests: expect(200, saveId('file_id'))
  }),
  req('Preview uploaded file -> 200', 'GET', '/api/drive/preview-data/{{file_id}}', { token: 'staff_token', pre: needs('file_id'), tests: expect(200, `pm.test('Text preview', () => pm.expect(pm.response.json().kind).to.eql('text'));`) }),
  req('Upload file - missing parent -> 404', 'POST', '/api/drive/upload', {
    token: 'staff_token',
    body: { mode: 'formdata', formdata: [{ key: 'parentId', value: '999999999', type: 'text' }, { key: 'file', type: 'file', src: 'fixtures/sample-upload.txt' }] },
    tests: expect(404)
  }),
  ...[0, 1].map(i => req(`Large upload: chunk ${i + 1} of 2`, 'POST', '/api/drive/upload-chunk', {
    token: 'staff_token',
    pre: i === 0 ? `pm.environment.set('upload_id', 'pm' + Date.now());` + needs('folder_id') : needs('upload_id'),
    headers: [
      { key: 'Content-Type', value: 'application/octet-stream' },
      { key: 'x-chunk-number', value: String(i) },
      { key: 'x-total-chunks', value: '2' },
      { key: 'x-file-name', value: 'chunked%20report%20{{run_id}}.txt' },
      { key: 'x-upload-id', value: '{{upload_id}}' },
      { key: 'x-parent-id', value: '{{folder_id}}' }
    ],
    body: { mode: 'raw', raw: i === 0 ? 'first-half|' : 'second-half' },
    tests: i === 0
      ? expect(200, `pm.test('Chunk accepted', () => pm.expect(pm.response.json().message).to.eql('Chunk received'));`)
      : expect(200, `
      const b = pm.response.json();
      pm.test('Upload complete', () => pm.expect(b.message).to.eql('Upload complete'));
      pm.test('Decoded file name kept', () => pm.expect(b.file).to.eql('chunked report ' + pm.environment.get('run_id') + '.txt'));
      pm.environment.set('chunked_file_id', b.id);
      `)
  })),
  req('Chunk status -> 200', 'GET', '/api/drive/upload-chunk/status?uploadId={{upload_id}}&totalChunks=2', { token: 'staff_token', pre: needs('upload_id'), tests: expect(200, `pm.test('Chunks cleaned up after assembly', () => pm.expect(pm.response.json().uploaded).to.eql([]));`) }),
  req('Download chunked file -> content intact', 'GET', '/api/drive/download/{{chunked_file_id}}', { token: 'staff_token', pre: needs('chunked_file_id'), tests: expect(200, `pm.test('Chunks assembled in order', () => pm.expect(pm.response.text()).to.eql('first-half|second-half'));`) }),
  req('List test folder -> contents', 'GET', '/api/drive/items?parentId={{folder_id}}', { token: 'staff_token', pre: needs('folder_id'), tests: expect(200, `
  const names = pm.response.json().map(i => i.type + ':' + i.name);
  pm.test('Has Designs and Website folders', () => pm.expect(names).to.include.members(['folder:Designs', 'folder:Website']));
  pm.test('Has the chunk-uploaded file', () => pm.expect(names).to.include('file:chunked report ' + pm.environment.get('run_id') + '.txt'));
  `) }),
  req('Share file with leader (admin) -> 200', 'POST', '/api/drive/share', { token: 'admin_token', pre: needs('file_id', 'leader_id'), body: json({ itemId: '{{file_id}}', userIds: ['{{leader_id}}'], accessLevel: 'viewer' }), tests: expect(200) }),
  req('File permissions (admin) -> 200', 'GET', '/api/drive/permissions/{{file_id}}', { token: 'admin_token', pre: needs('file_id'), tests: expect(200, `pm.test('Leader listed', () => pm.expect(pm.response.json().map(p => String(p.user_id))).to.include(String(pm.environment.get('leader_id'))));`) }),
  req('Revoke share (admin) -> 200', 'DELETE', '/api/drive/share/{{file_id}}/{{leader_id}}', { token: 'admin_token', pre: needs('file_id', 'leader_id'), tests: expect(200) }),
  req('Leader adds a folder inside the designer\'s folder -> 200', 'POST', '/api/drive/folder', { token: 'leader_token', pre: needs('folder_id'), body: json({ name: 'Leader notes', parentId: '{{folder_id}}' }), tests: expect(200, saveId('leader_folder_id')) }),
  req('Delete someone else\'s folder -> 403', 'DELETE', '/api/drive/{{folder_id}}', { token: 'leader_token', pre: needs('folder_id'), tests: expect(403) }),
  req('Delete own folder that contains others\' items -> 403', 'DELETE', '/api/drive/{{folder_id}}', { token: 'staff_token', pre: needs('folder_id'), tests: expect(403, `pm.test('Explains why', () => pm.expect(pm.response.json().error).to.match(/added by other people/));`) }),
  req('Leader deletes own folder -> 200', 'DELETE', '/api/drive/{{leader_folder_id}}', { token: 'leader_token', pre: needs('leader_folder_id'), tests: expect(200, `pm.environment.unset('leader_folder_id');`) }),
  req('Designer deletes own sub-folder -> 200', 'DELETE', '/api/drive/{{subfolder_id}}', { token: 'staff_token', pre: needs('subfolder_id'), tests: expect(200) }),
  req('Deleted sub-folder is gone', 'GET', '/api/drive/items?parentId={{folder_id}}', { token: 'staff_token', pre: needs('folder_id'), tests: expect(200, `pm.test('No "Designs" folder any more', () => pm.expect(pm.response.json().map(i => i.name)).to.not.include('Designs'));`) }),
  req('Delete unknown item -> 404', 'DELETE', '/api/drive/999999999', { token: 'staff_token', tests: expect(404) })
];
const drive = folder('4.15 Secure Drive', driveItems);

const enterprise = folder('4.16 Enterprise (HR, goals, policies...)', [
  req('Monitoring summary (admin) -> 200', 'GET', '/api/enterprise/monitoring/summary', { token: 'admin_token', tests: expect(200) }),
  req('Permissions matrix (admin) -> 200', 'GET', '/api/enterprise/permissions-matrix', { token: 'admin_token', tests: expect(200) }),
  req('My day -> 200', 'GET', '/api/enterprise/my-day', { token: 'staff_token', tests: expect(200) }),
  req('Start work session -> 200', 'POST', '/api/enterprise/work-sessions/start', { token: 'staff_token', body: json({ source: 'postman' }), tests: expect(200, saveId('work_session_id')) }),
  req('Stop work session -> 200', 'POST', '/api/enterprise/work-sessions/{{work_session_id}}/stop', { token: 'staff_token', pre: needs('work_session_id'), tests: expect(200) }),
  req('Stop someone else\'s session -> 404', 'POST', '/api/enterprise/work-sessions/{{work_session_id}}/stop', { token: 'leader_token', pre: needs('work_session_id'), tests: expect(404) }),
  req('Work sessions -> 200', 'GET', '/api/enterprise/work-sessions', { token: 'staff_token', tests: expect(200) }),
  req('Onboarding - get -> 200', 'GET', '/api/enterprise/onboarding/me', { token: 'staff_token', tests: expect(200) }),
  req('Onboarding - complete -> 200', 'PUT', '/api/enterprise/onboarding/me', { token: 'staff_token', body: json({ is_completed: 1, walkthrough_version: 'v1' }), tests: expect(200) }),
  req('Send product feedback -> 200', 'POST', '/api/enterprise/feedback', { token: 'staff_token', body: json({ page: 'postman', category: 'test', message: 'Postman feedback {{run_id}}' }), tests: expect(200) }),
  req('Feedback - empty -> 400', 'POST', '/api/enterprise/feedback', { token: 'staff_token', body: json({ page: 'x' }), tests: expect(400) }),
  req('Feedback list (admin) -> 200', 'GET', '/api/enterprise/feedback', { token: 'admin_token', tests: expect(200) }),
  req('Help article - create -> 200', 'POST', '/api/enterprise/help/articles', { token: 'admin_token', body: json({ title: 'Postman Help {{run_id}}', content: 'test', role_scope: 'designer' }), tests: expect(200) }),
  req('Help articles -> 200', 'GET', '/api/enterprise/help/articles', { token: 'staff_token', tests: expect(200) }),
  req('Task template - create -> 200', 'POST', '/api/enterprise/task-templates', { token: 'leader_token', body: json({ name: 'Postman template {{run_id}}', title: 'Weekly check', role: 'designer', priority: 'low', sla_hours: 24 }), tests: expect(200, saveId('task_template_id')) }),
  req('Task templates -> 200', 'GET', '/api/enterprise/task-templates', { token: 'staff_token', tests: expect(200) }),
  req('Recurring task - missing fields -> 400', 'POST', '/api/enterprise/recurring-tasks', { token: 'leader_token', body: json({ frequency: 'weekly' }), tests: expect(400) }),
  req('Recurring task - create -> 200', 'POST', '/api/enterprise/recurring-tasks', { token: 'leader_token', pre: needs('task_template_id'), body: json({ template_id: '{{task_template_id}}', frequency: 'weekly', next_run_at: '2099-01-01T09:00:00Z' }), tests: expect(200) }),
  req('Goal - create -> 200', 'POST', '/api/enterprise/goals', { token: 'leader_token', body: json({ user_id: '{{staff_id}}', title: 'Postman goal {{run_id}}', target_value: 10, due_date: '2099-12-31' }), tests: expect(200, saveId('goal_id')) }),
  req('Goal - update -> 200', 'PUT', '/api/enterprise/goals/{{goal_id}}', { token: 'leader_token', pre: needs('goal_id'), body: json({ current_value: 5 }), tests: expect(200) }),
  req('Goals -> 200', 'GET', '/api/enterprise/goals', { token: 'staff_token', tests: expect(200) }),
  req('Feedback cycle - create -> 200', 'POST', '/api/enterprise/feedback-cycles', { token: 'leader_token', body: json({ user_id: '{{staff_id}}', reviewer_id: '{{leader_id}}', cycle_name: 'Postman Q {{run_id}}' }), tests: expect(200, saveId('feedback_cycle_id')) }),
  req('Feedback cycle - self review -> 200', 'PUT', '/api/enterprise/feedback-cycles/{{feedback_cycle_id}}', { token: 'staff_token', pre: needs('feedback_cycle_id'), body: json({ self_review: 'Did good work' }), tests: expect(200) }),
  req('Skills - set -> 200', 'PUT', '/api/enterprise/skills/{{staff_id}}', { token: 'leader_token', body: json({ skills: [{ skill: 'Figma', level: 4 }] }), tests: expect(200) }),
  req('Skills - get -> 200', 'GET', '/api/enterprise/skills/{{staff_id}}', { token: 'staff_token', tests: expect(200) }),
  req('Meeting note - create -> 200', 'POST', '/api/enterprise/meeting-notes', { token: 'leader_token', body: json({ project_id: '{{project_id}}', title: 'Postman notes {{run_id}}', notes: 'test' }), tests: expect(200) }),
  req('Meeting notes -> 200', 'GET', '/api/enterprise/meeting-notes', { token: 'staff_token', tests: expect(200) }),
  req('Team inbox thread - create -> 200', 'POST', '/api/enterprise/team-inbox/threads', { token: 'leader_token', pre: needs('team_id'), body: json({ team_id: '{{team_id}}', client_id: '{{client_id}}', subject: 'Postman thread {{run_id}}' }), tests: expect(200, saveId('thread_id')) }),
  req('Team inbox - reply -> 200', 'POST', '/api/enterprise/team-inbox/threads/{{thread_id}}/messages', { token: 'staff_token', pre: needs('thread_id'), body: json({ message: 'Reply from Postman' }), tests: expect(200) }),
  req('Team inbox - empty reply -> 400', 'POST', '/api/enterprise/team-inbox/threads/{{thread_id}}/messages', { token: 'staff_token', pre: needs('thread_id'), body: json({}), tests: expect(400) }),
  req('Team inbox - messages -> 200', 'GET', '/api/enterprise/team-inbox/threads/{{thread_id}}/messages', { token: 'staff_token', pre: needs('thread_id'), tests: expect(200) }),
  req('Team inbox threads -> 200', 'GET', '/api/enterprise/team-inbox/threads', { token: 'staff_token', tests: expect(200) }),
  req('Team announcements -> 200', 'GET', '/api/enterprise/team-announcements', { token: 'staff_token', tests: expect(200) }),
  req('Role template - create -> 200', 'POST', '/api/enterprise/role-templates', { token: 'admin_token', body: json({ name: 'postman_template_{{run_id}}', department: 'QA', primary_role: 'designer', description: 'test' }), tests: expect(200, saveId('role_template_id')) }),
  req('Role template - update -> 200', 'PUT', '/api/enterprise/role-templates/{{role_template_id}}', { token: 'admin_token', pre: needs('role_template_id'), body: json({ description: 'updated' }), tests: expect(200) }),
  req('Role template - permissions -> 200', 'PUT', '/api/enterprise/role-templates/{{role_template_id}}/permissions', { token: 'admin_token', pre: needs('role_template_id'), body: json({ permission_keys: ['dashboard.view', 'tasks.view'] }), tests: expect(200) }),
  req('Policies -> 200', 'GET', '/api/enterprise/policies', { token: 'staff_token', tests: expect(200) }),
  req('Policy - set -> 200', 'PUT', '/api/enterprise/policies/postman_{{run_id}}', { token: 'admin_token', body: json({ value: 'on' }), tests: expect(200) }),
  req('Policy - delete -> 200', 'DELETE', '/api/enterprise/policies/postman_{{run_id}}', { token: 'admin_token', tests: expect(200) }),
  req('Policy document - create -> 200', 'POST', '/api/enterprise/policy-documents', { token: 'admin_token', body: json({ title: 'Postman Policy {{run_id}}', content: 'Policy body', references: [] }), tests: expect(200, saveId('policy_doc_id')) }),
  req('Policy document - no content -> 400', 'POST', '/api/enterprise/policy-documents', { token: 'admin_token', body: json({ title: 'x' }), tests: expect(400) }),
  req('Policy documents -> 200', 'GET', '/api/enterprise/policy-documents', { token: 'staff_token', tests: expect(200) }),
  req('Policy document - get -> 200', 'GET', '/api/enterprise/policy-documents/{{policy_doc_id}}', { token: 'staff_token', pre: needs('policy_doc_id'), tests: expect(200) }),
  req('Export users (admin) -> 200', 'GET', '/api/enterprise/export/users', { token: 'admin_token', tests: expect(200, `pm.test('No password hashes in export', () => pm.expect(pm.response.text()).to.not.match(/\\$2[aby]\\$\\d\\d\\$/));`) }),
  req('Export - unsupported entity -> 400', 'GET', '/api/enterprise/export/secrets', { token: 'admin_token', tests: expect(400) }),
  req('Queue job -> 200', 'POST', '/api/enterprise/jobs', { token: 'admin_token', body: json({ type: 'postman_noop', payload: { run: '{{run_id}}' }, run_at: '2099-01-01T00:00:00Z' }), tests: expect(200) }),
  req('Jobs -> 200', 'GET', '/api/enterprise/jobs', { token: 'admin_token', tests: expect(200) })
]);

const admin = folder('4.17 Admin & Database viewer', [
  req('Audit (admin) -> 200', 'GET', '/api/admin/audit', { token: 'admin_token', tests: expect(200) }),
  req('Heatmap -> 200', 'GET', '/api/admin/heatmap', { token: 'admin_token', tests: expect(200) }),
  req('Roles summary -> 200', 'GET', '/api/admin/roles-summary', { token: 'admin_token', tests: expect(200) }),
  req('Roles users -> 200', 'GET', '/api/admin/roles-users', { token: 'admin_token', tests: expect(200) }),
  req('Company roles -> 200', 'GET', '/api/admin/company-roles', { token: 'admin_token', tests: expect(200, `
  const sys = (pm.response.json() || []).find(r => r.name === 'designer');
  if (sys) pm.environment.set('system_role_id', sys.id);
  `) }),
  req('Company role - create -> 200', 'POST', '/api/admin/company-roles', { token: 'admin_token', body: json({ name: 'postman_role_{{run_id}}', description: 'test', color: '#123456' }), tests: expect(200, saveId('company_role_id')) }),
  req('Company role - update -> 200', 'PUT', '/api/admin/company-roles/{{company_role_id}}', { token: 'admin_token', pre: needs('company_role_id'), body: json({ description: 'updated' }), tests: expect(200) }),
  req('Company role - system role cannot be renamed -> 400', 'PUT', '/api/admin/company-roles/{{system_role_id}}', { token: 'admin_token', pre: needs('system_role_id'), body: json({ name: 'renamed' }), tests: expect(400) }),
  req('DB viewer - tables -> 200', 'GET', '/api/dbadmin/tables', { token: 'admin_token', tests: expect(200) }),
  req('DB viewer - users table hides password hashes', 'GET', '/api/dbadmin/table/users?limit=5', { token: 'admin_token', tests: expect(200, `pm.test('No bcrypt hashes returned', () => pm.expect(pm.response.text()).to.not.match(/\\$2[aby]\\$\\d\\d\\$/));`) }),
  req('DB viewer - unknown table -> 404', 'GET', '/api/dbadmin/table/not_a_table', { token: 'admin_token', tests: expect(404) }),
  req('DB viewer - schema -> 200', 'GET', '/api/dbadmin/schema/users', { token: 'admin_token', tests: expect(200) }),
  req('DB viewer - SELECT query -> 200', 'POST', '/api/dbadmin/query', { token: 'admin_token', body: json({ sql: 'SELECT 1 AS ok' }), tests: expect(200, `pm.test('Select result', () => pm.expect(pm.response.json().rows[0].ok).to.eql(1));`) }),
  req('DB viewer - empty query -> 400', 'POST', '/api/dbadmin/query', { token: 'admin_token', body: json({ sql: '' }), tests: expect(400) })
]);

const dashboard = folder('4.18 Dashboard, analytics & misc', [
  req('Top performers (month) -> 200', 'GET', '/api/analytics/top-performers?period=month', { token: 'staff_token', tests: expect(200, `pm.test('Has performers list', () => pm.expect(pm.response.json().performers).to.be.an('array'));`) }),
  req('Top performers (all time) -> 200', 'GET', '/api/analytics/top-performers?period=all', { token: 'staff_token', tests: expect(200) }),
  req('Analytics summary -> 200', 'GET', '/api/analytics/summary', { token: 'staff_token', tests: expect(200) }),
  req('Integrations status -> 200', 'GET', '/api/integrations/status', { token: 'staff_token', tests: expect(200) }),
  req('Settings (admin) -> 200', 'GET', '/api/settings', { token: 'admin_token', tests: expect(200) }),
  req('Announcements -> 200', 'GET', '/api/announcements', { token: 'staff_token', tests: expect(200, isArray) }),
  req('Response is gzip-compressed', 'GET', '/api/users', { token: 'admin_token', headers: [{ key: 'Accept-Encoding', value: 'gzip' }], tests: expect(200, `pm.test('Content-Encoding gzip (large JSON)', () => { if (pm.response.size().body > 1024) pm.expect(pm.response.headers.get('Content-Encoding')).to.eql('gzip'); });`) }),
  req('Per-user rate limit headers present', 'GET', '/api/auth/me', { token: 'staff_token', tests: expect(200, `pm.test('RateLimit-Limit header', () => pm.expect(pm.response.headers.get('RateLimit-Limit')).to.exist);`) })
]);

// ---------------------------------------------------------------------------
// 5. Optional: flows that notify every employee (off by default)
// ---------------------------------------------------------------------------
const optional = folder('5. Optional - notifies/emails all staff (off by default)', [
  req('Announcement - create -> 200', 'POST', '/api/announcements', { token: 'admin_token', pre: optionalOnly, body: json({ title: 'Postman test announcement {{run_id}}', body: 'Please ignore - automated test', pinned: 0 }), tests: expect(200, saveId('announcement_id')) }),
  req('Announcement - designer cannot create -> 403', 'POST', '/api/announcements', { token: 'staff_token', pre: optionalOnly, body: json({ title: 'x', body: 'y' }), tests: expect(403) }),
  req('Announcement - update -> 200', 'PUT', '/api/announcements/{{announcement_id}}', { token: 'admin_token', pre: optionalOnly + needs('announcement_id'), body: json({ title: 'Postman test announcement {{run_id}} (edited)', body: 'Please ignore' }), tests: expect(200) }),
  req('Announcement - pin -> 200', 'PUT', '/api/announcements/{{announcement_id}}/pin', { token: 'admin_token', pre: optionalOnly + needs('announcement_id'), tests: expect(200) }),
  req('Announcement - delete -> 200', 'DELETE', '/api/announcements/{{announcement_id}}', { token: 'admin_token', pre: optionalOnly + needs('announcement_id'), tests: expect(200) }),
  req('Team announcement -> 200', 'POST', '/api/enterprise/team-announcements', { token: 'admin_token', pre: optionalOnly + needs('team_id'), body: json({ team_id: '{{team_id}}', title: 'Postman team note {{run_id}}', body: 'test' }), tests: expect(200) }),
  req('Leader approves submission -> 200 (emails admins)', 'PUT', '/api/submissions/{{submission_id}}/leader-review', { token: 'leader_token', pre: optionalOnly + needs('submission_id'), body: json({ status: 'approved' }), tests: expect(200) }),
  req('Admins were notified the submission is ready', 'GET', '/api/notifications', { token: 'admin_token', pre: optionalOnly + needs('submission_id'), tests: expect(200, `pm.test('"ready for admin approval" notification received', () => pm.expect(pm.response.text()).to.include('ready for admin approval'));`) }),
  req('Admin approves submission -> 200', 'PUT', '/api/submissions/{{submission_id}}/admin-review', { token: 'admin_token', pre: optionalOnly + needs('submission_id'), body: json({ status: 'approved' }), tests: expect(200) }),
  req('Client posts review -> 200 (emails admins)', 'POST', '/api/client-portal/reviews', { token: 'client_token', pre: optionalOnly + needs('client_token', 'project_id'), body: json({ project_id: '{{project_id}}', rating: 5, feedback_text: 'Postman test review' }), tests: expect(200) }),
  req('Client proposes meeting -> 200 (emails admins)', 'POST', '/api/client-portal/meetings', { token: 'client_token', pre: optionalOnly + needs('client_token'), body: json({ title: 'Postman meeting {{run_id}}', scheduled_at: '2099-01-02T10:00:00Z', team_leader_id: '{{leader_id}}' }), tests: expect(200) })
], 'Skipped unless the environment variable run_notifying_tests is "true". These create notifications (and emails, if SMTP is configured) for every admin or every employee.');

// ---------------------------------------------------------------------------
// 6. Unmounted modules
// ---------------------------------------------------------------------------
const unmounted = folder('6. Role workspaces (design vault, nexus lab, broadcast hub, creator slate)', [
  ['GET', '/api/design-vault/assets', 'Design Vault'],
  ['GET', '/api/nexus-lab/knowledge', 'Nexus Lab - knowledge'],
  ['GET', '/api/nexus-lab/experiments', 'Nexus Lab - experiments'],
  ['GET', '/api/broadcast-hub/posts', 'Broadcast Hub'],
  ['GET', '/api/creator-slate/events', 'Creator Slate - events'],
  ['GET', '/api/creator-slate/gear', 'Creator Slate - gear']
].map(([m, p, label]) => req(`${label}: ${m} ${p} -> 200 JSON`, m, p, {
  token: 'admin_token',
  tests: expect(200, `pm.test('Answers with JSON (not the HTML app shell)', () => pm.expect(pm.response.headers.get('Content-Type') || '').to.include('application/json'));`)
})), 'These modules were previously never registered in backend/index.js, so their pages could not load data. Their write endpoints are covered by sections 2 and 3.');

// ---------------------------------------------------------------------------
// 7/8. Cleanup
// ---------------------------------------------------------------------------
const del = (name, p, v, token = 'admin_token', status = [200, 404]) =>
  req(name, 'DELETE', p, { token, pre: needs(v), tests: expect(status, `pm.environment.unset('${v}');`) });
const cleanup = folder('8. Cleanup (removes everything this run created)', [
  del('Delete whiteboard', '/api/workspace/{{whiteboard_id}}', 'whiteboard_id', 'staff_token'),
  del('Delete leader drive folder (if left over)', '/api/drive/{{leader_folder_id}}', 'leader_folder_id'),
  del('Delete drive folder (and files)', '/api/drive/{{folder_id}}', 'folder_id'),
  del('Delete course', '/api/courses/{{course_id}}', 'course_id'),
  del('Delete ticket', '/api/tickets/{{ticket_id}}', 'ticket_id'),
  del('Delete payment', '/api/payments/{{payment_id}}', 'payment_id'),
  del('Delete rogue payment (if one was created)', '/api/payments/{{rogue_payment_id}}', 'rogue_payment_id'),
  del('Delete private conversation', '/api/messages/conversations/{{private_conversation_id}}', 'private_conversation_id', 'staff_token'),
  del('Delete conversation', '/api/messages/conversations/{{conversation_id}}', 'conversation_id', 'staff_token'),
  del('Delete team conversation', '/api/messages/conversations/{{team_conversation_id}}', 'team_conversation_id'),
  del('Delete client group conversation', '/api/messages/conversations/{{client_conversation_id}}', 'client_conversation_id'),
  del('Delete submission', '/api/submissions/{{submission_id}}', 'submission_id'),
  del('Delete task', '/api/tasks/{{task_id}}', 'task_id'),
  del('Delete project', '/api/projects/{{project_id}}', 'project_id'),
  del('Delete client', '/api/clients/{{client_id}}', 'client_id'),
  del('Delete second client', '/api/clients/{{client_b_id}}', 'client_b_id'),
  del('Delete team', '/api/teams/{{team_id}}', 'team_id'),
  del('Delete company role', '/api/admin/company-roles/{{company_role_id}}', 'company_role_id'),
  del('Delete role template', '/api/enterprise/role-templates/{{role_template_id}}', 'role_template_id'),
  del('Delete policy document', '/api/enterprise/policy-documents/{{policy_doc_id}}', 'policy_doc_id'),
  // These records have no DELETE endpoint in the API, so they are removed through the admin
  // DB console. Every statement is scoped to this run's unique run_id.
  ...[
    ['client ticket', "DELETE FROM tickets WHERE title = 'Postman client ticket {{run_id}}'"],
    ['goal', "DELETE FROM goals WHERE title = 'Postman goal {{run_id}}'"],
    ['feedback cycle', "DELETE FROM feedback_cycles WHERE cycle_name = 'Postman Q {{run_id}}'"],
    ['help article', "DELETE FROM help_articles WHERE title = 'Postman Help {{run_id}}'"],
    ['task template (+ recurring task)', "DELETE FROM recurring_tasks WHERE template_id IN (SELECT id FROM task_templates WHERE name = 'Postman template {{run_id}}')"],
    ['task template', "DELETE FROM task_templates WHERE name = 'Postman template {{run_id}}'"],
    ['meeting note', "DELETE FROM meeting_notes WHERE title = 'Postman notes {{run_id}}'"],
    ['team inbox messages', "DELETE FROM team_inbox_messages WHERE thread_id IN (SELECT id FROM team_inbox_threads WHERE subject = 'Postman thread {{run_id}}')"],
    ['team inbox thread', "DELETE FROM team_inbox_threads WHERE subject = 'Postman thread {{run_id}}'"],
    ['product feedback', "DELETE FROM user_feedback WHERE message = 'Postman feedback {{run_id}}'"],
    ['queued job', "DELETE FROM job_queue WHERE type = 'postman_noop' AND payload LIKE '%{{run_id}}%'"],
    ['test users’ work sessions', "DELETE FROM work_sessions WHERE user_id IN (SELECT id FROM users WHERE email IN ('pm.designer.{{run_id}}@example.invalid','pm.leader.{{run_id}}@example.invalid'))"],
    ['notifications this run sent to others (optional section)', "DELETE FROM notifications WHERE message LIKE '%Postman%{{run_id}}%'"],
    ['test users’ notifications',"DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email IN ('pm.designer.{{run_id}}@example.invalid','pm.leader.{{run_id}}@example.invalid'))"],
    ['test users’ skills', "DELETE FROM skill_matrix WHERE user_id IN (SELECT id FROM users WHERE email IN ('pm.designer.{{run_id}}@example.invalid','pm.leader.{{run_id}}@example.invalid'))"]
  ].map(([what, sql]) => req(`Remove ${what} (no API delete)`, 'POST', '/api/dbadmin/query', {
    token: 'admin_token', pre: needs('run_id'), body: json({ sql }), tests: expect(200)
  })),
  del('Deactivate test designer', '/api/users/{{staff_id}}', 'staff_id'),
  del('Deactivate test leader', '/api/users/{{leader_id}}', 'leader_id'),
  req('Deactivated account can no longer sign in -> 401', 'POST', '/api/auth/login', {
    body: json({ email: 'pm.designer.{{run_id}}@example.invalid', password: '{{test_password}}', role: 'designer' }),
    tests: expect(401)
  })
]);

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------
const collection = {
  info: {
    name: 'TechTurf CRM API - full suite',
    description: 'End-to-end API tests for the whole TechTurf CRM. Only needs an admin account: it creates its own test employees, client, project, etc. and removes them in "8. Cleanup". See postman/README.md. Generated by postman/generate-collection.js - edit that file, not this JSON.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  event: [testEv(`
  pm.test('[perf] responded in under 2 s', () => pm.expect(pm.response.responseTime).to.be.below(2000));
  `)],
  item: [
    setup, auth, security, roleSec,
    folder('4. Module flows', [users, teams, clients, projects, tasks, submissions, portal, clientReports, messages, payments, tickets, courses, notifications, workspace, drive, enterprise, admin, dashboard]),
    optional, unmounted, cleanup
  ]
};

const environment = {
  name: 'TechTurf Local',
  values: [
    { key: 'base_url', value: 'http://localhost:3000', type: 'default', enabled: true },
    { key: 'admin_email', value: '', type: 'default', enabled: true },
    { key: 'admin_password', value: '', type: 'secret', enabled: true },
    { key: 'admin_role', value: 'admin', type: 'default', enabled: true },
    { key: 'run_notifying_tests', value: 'false', type: 'default', enabled: true }
  ],
  _postman_variable_scope: 'environment'
};

fs.mkdirSync(path.join(OUT_DIR, 'fixtures'), { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'TechTurf_API.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
fs.writeFileSync(path.join(OUT_DIR, 'TechTurf_Local.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');
const sample = path.join(OUT_DIR, 'fixtures', 'sample-upload.txt');
if (!fs.existsSync(sample)) fs.writeFileSync(sample, 'TechTurf Secure Drive upload test file.\n');

const count = (items) => items.reduce((n, i) => n + (i.item ? count(i.item) : 1), 0);
console.log(`Collection written: ${count(collection.item)} requests (${unauthItems.length} no-login, ${roleItems.length} role checks)`);
