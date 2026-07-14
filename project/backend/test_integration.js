/**
 * Integration Tests — Cross-client Data Isolation
 * Tests that Client A cannot see Client B's payments, messages, or projects.
 * Standalone script — no test framework required.
 *
 * Usage: node project/backend/test_integration.js
 */

const http = require('http');
const path = require('path');
const db = require('./db');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const API = `${BASE_URL}/api`;

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${label}`);
  }
}

function request(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('\n🔬 TechTurf CRM — Integration Tests');
  console.log('====================================\n');

  // --- SETUP: Get a staff token via bypass ---
  console.log('📋 Setup: Authenticating test users...');
  
  const staffLogin = await request('POST', `${API}/auth/login`, {
    email: 'admin@techturf.com',
    password: 'Admin@12345'
  });
  assert(staffLogin.status === 200, 'Staff login');
  const staffToken = staffLogin.body.token;
  if (!staffToken) {
    console.error('❌ Cannot continue without staff token. Is the server running?');
    process.exit(1);
  }

  // --- SETUP: Create two test clients ---
  console.log('\n📋 Setup: Creating test clients...');
  
  // First check if clients exist already
  const existingClients = await request('GET', `${API}/clients`, null, staffToken);
  let clientA_id, clientB_id;

  const runId = Date.now();
  const loginA = `TT-CLI-TESTA-${runId}`;
  const loginB = `TT-CLI-TESTB-${runId}`;

  // Create Client A
  const createA = await request('POST', `${API}/clients`, {
    name: `Test Client A ${runId}`,
    company: 'Alpha Corp',
    email: `testa_${runId}@test.com`,
    client_login_id: loginA,
    stage: 'active'
  }, staffToken);
  
  if (createA.status === 200 || createA.status === 201) {
    clientA_id = createA.body.id || createA.body.client_id;
    console.log(`  Created Client A: id=${clientA_id}`);
  } else {
    console.error('  ❌ Failed to create Client A:', createA.body);
  }

  // Create Client B
  const createB = await request('POST', `${API}/clients`, {
    name: `Test Client B ${runId}`,
    company: 'Beta Inc',
    email: `testb_${runId}@test.com`,
    client_login_id: loginB,
    stage: 'active'
  }, staffToken);
  
  if (createB.status === 200 || createB.status === 201) {
    clientB_id = createB.body.id || createB.body.client_id;
    console.log(`  Created Client B: id=${clientB_id}`);
  } else {
    console.error('  ❌ Failed to create Client B:', createB.body);
  }

  if (!clientA_id || !clientB_id) {
    console.error('\n❌ Cannot continue without both test clients. Aborting.');
    process.exit(1);
  }

  // Backfill client_login_id using the DB directly since POST /clients might not save it yet
  const bcrypt = require('bcryptjs');
  const clientHash = bcrypt.hashSync('ClientPassword@123', 12);
  db.prepare('UPDATE clients SET client_login_id = ?, password_hash = ?, is_active = 1 WHERE id = ?').run(loginA, clientHash, clientA_id);
  db.prepare('UPDATE clients SET client_login_id = ?, password_hash = ?, is_active = 1 WHERE id = ?').run(loginB, clientHash, clientB_id);

  // --- SETUP: Login as Client A and Client B via client portal ---
  console.log('\n📋 Setup: Client portal logins...');
  
  const clientALogin = await request('POST', `${API}/client-portal/login`, {
    client_login_id: loginA,
    password: 'ClientPassword@123'
  });
  assert(clientALogin.status === 200, 'Client A login');
  const clientAToken = clientALogin.body.token;

  const clientBLogin = await request('POST', `${API}/client-portal/login`, {
    client_login_id: loginB,
    password: 'ClientPassword@123'
  });
  assert(clientBLogin.status === 200, 'Client B login');
  const clientBToken = clientBLogin.body.token;

  if (!clientAToken || !clientBToken) {
    console.error('\n❌ Cannot continue without both client tokens. Aborting.');
    process.exit(1);
  }

  // ============================================================
  // TEST 1: PAYMENTS ISOLATION
  // ============================================================
  console.log('\n🔒 Test Suite: Payments Data Isolation');
  console.log('--------------------------------------');

  // Staff creates a payment for Client A
  const payA = await request('POST', `${API}/payments`, {
    client_id: clientA_id,
    amount: 50000,
    currency: 'INR',
    payment_date: new Date().toISOString(),
    method: 'UPI',
    status: 'paid',
    notes: 'Test payment for Client A'
  }, staffToken);
  assert(payA.status === 200, 'Staff creates payment for Client A');

  // Staff creates a payment for Client B
  const payB = await request('POST', `${API}/payments`, {
    client_id: clientB_id,
    amount: 30000,
    currency: 'INR',
    payment_date: new Date().toISOString(),
    method: 'Bank Transfer',
    status: 'pending',
    notes: 'Test payment for Client B'
  }, staffToken);
  assert(payB.status === 200, 'Staff creates payment for Client B');

  // Staff creates an internal-only payment (no client_id)
  const payInternal = await request('POST', `${API}/payments`, {
    amount: 10000,
    currency: 'INR',
    method: 'Cash',
    status: 'paid',
    notes: 'Internal payment - no client'
  }, staffToken);
  assert(payInternal.status === 200, 'Staff creates internal payment (no client_id)');

  // Client A views their payments
  const clientAPayments = await request('GET', `${API}/client-portal/payments`, null, clientAToken);
  assert(clientAPayments.status === 200, 'Client A can fetch payments');
  
  const clientAPaymentsList = clientAPayments.body.payments || [];
  const hasOwnPayment = clientAPaymentsList.some(p => Number(p.amount) === 50000);
  const hasClientBPayment = clientAPaymentsList.some(p => Number(p.amount) === 30000);
  const hasInternalPayment = clientAPaymentsList.some(p => Number(p.amount) === 10000);
  
  console.log("DEBUG: clientAPaymentsList=", JSON.stringify(clientAPaymentsList));
  assert(hasOwnPayment, 'Client A sees their own payment (₹50,000)');
  assert(!hasClientBPayment, 'Client A CANNOT see Client B\'s payment (₹30,000)');
  assert(!hasInternalPayment, 'Client A CANNOT see internal-only payment (₹10,000)');

  // Client A's payments don't leak internal fields
  if (clientAPaymentsList.length > 0) {
    const samplePayment = clientAPaymentsList[0];
    assert(!('created_by' in samplePayment), 'Client A\'s payments don\'t expose created_by');
    assert(!('user_id' in samplePayment), 'Client A\'s payments don\'t expose user_id');
  }

  // Client B views their payments
  const clientBPayments = await request('GET', `${API}/client-portal/payments`, null, clientBToken);
  assert(clientBPayments.status === 200, 'Client B can fetch payments');
  
  const clientBPaymentsList = clientBPayments.body.payments || [];
  const bHasOwnPayment = clientBPaymentsList.some(p => Number(p.amount) === 30000);
  const bHasClientAPayment = clientBPaymentsList.some(p => Number(p.amount) === 50000);
  
  assert(bHasOwnPayment, 'Client B sees their own payment (₹30,000)');
  assert(!bHasClientAPayment, 'Client B CANNOT see Client A\'s payment (₹50,000)');

  // ============================================================
  // TEST 2: MESSAGING ISOLATION
  // ============================================================
  console.log('\n🔒 Test Suite: Messaging Data Isolation');
  console.log('---------------------------------------');

  // Client A sends a message
  const msgA = await request('POST', `${API}/client-portal/messages`, {
    message: 'Hello from Client A - integration test'
  }, clientAToken);
  assert(msgA.status === 200, 'Client A sends a message');

  // Client B sends a message
  const msgB = await request('POST', `${API}/client-portal/messages`, {
    message: 'Hello from Client B - integration test'
  }, clientBToken);
  assert(msgB.status === 200, 'Client B sends a message');

  // Client A views their messages
  const clientAMessages = await request('GET', `${API}/client-portal/messages`, null, clientAToken);
  assert(clientAMessages.status === 200, 'Client A can fetch messages');
  
  const aMessages = clientAMessages.body.messages || [];
  const aHasOwn = aMessages.some(m => m.message.includes('Client A'));
  const aHasClientB = aMessages.some(m => m.message.includes('Client B'));
  
  console.log("DEBUG: aMessages length=", aMessages.length, "contents=", JSON.stringify(aMessages));
  assert(aHasOwn, 'Client A sees their own message');
  assert(!aHasClientB, 'Client A CANNOT see Client B\'s messages');

  // Client B views their messages
  const clientBMessages = await request('GET', `${API}/client-portal/messages`, null, clientBToken);
  assert(clientBMessages.status === 200, 'Client B can fetch messages');
  
  const bMessages = clientBMessages.body.messages || [];
  const bHasOwn = bMessages.some(m => m.message.includes('Client B'));
  const bHasClientA = bMessages.some(m => m.message.includes('Client A'));
  
  assert(bHasOwn, 'Client B sees their own message');
  assert(!bHasClientA, 'Client B CANNOT see Client A\'s messages');

  // ============================================================
  // TEST 3: AUTH SCOPE ENFORCEMENT
  // ============================================================
  console.log('\n🔒 Test Suite: Auth Scope Enforcement');
  console.log('-------------------------------------');

  // Unauthenticated request should fail
  const noAuth = await request('GET', `${API}/client-portal/payments`);
  assert(noAuth.status === 401, 'Unauthenticated request to client-portal is rejected (401)');

  // Staff token should not work on client-portal
  const wrongToken = await request('GET', `${API}/client-portal/payments`, null, staffToken);
  assert(wrongToken.status === 403 || wrongToken.status === 401, 'Staff token rejected on client-portal (401/403)');

  // Client token should not work on employee API
  const clientOnEmployee = await request('GET', `${API}/payments`, null, clientAToken);
  assert(clientOnEmployee.status === 401 || clientOnEmployee.status === 403, 'Client token rejected on employee payments API');

  // ============================================================
  // TEST 4: TICKETS ISOLATION
  // ============================================================
  console.log('\n🔒 Test Suite: Tickets Data Isolation');
  console.log('-------------------------------------');

  // Client A creates a ticket
  const ticketA = await request('POST', `${API}/client-portal/tickets`, {
    title: 'Test Ticket A',
    description: 'Issue from Client A',
    priority: 'urgent',
    category: 'Billing'
  }, clientAToken);
  assert(ticketA.status === 200, 'Client A creates a support ticket');

  // Client B creates a ticket
  const ticketB = await request('POST', `${API}/client-portal/tickets`, {
    title: 'Test Ticket B',
    description: 'Issue from Client B',
    priority: 'normal',
    category: 'Technical'
  }, clientBToken);
  assert(ticketB.status === 200, 'Client B creates a support ticket');

  // Client A views tickets — should not see Client B's
  const clientATickets = await request('GET', `${API}/client-portal/tickets`, null, clientAToken);
  assert(clientATickets.status === 200, 'Client A can fetch tickets');
  
  const aTickets = Array.isArray(clientATickets.body) ? clientATickets.body : [];
  const aHasOwnTicket = aTickets.some(t => t.title === 'Test Ticket A');
  const aHasBTicket = aTickets.some(t => t.title === 'Test Ticket B');
  
  console.log("DEBUG: aTickets=", JSON.stringify(aTickets));
  assert(aHasOwnTicket, 'Client A sees their own ticket');
  assert(!aHasBTicket, 'Client A CANNOT see Client B\'s ticket');

  // ============================================================
  // RESULTS
  // ============================================================
  console.log('\n====================================');
  console.log(`📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('====================================\n');

  if (failed > 0) {
    console.error('❌ Some tests FAILED. Review output above.');
    process.exit(1);
  } else {
    console.log('✅ All tests PASSED!');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
