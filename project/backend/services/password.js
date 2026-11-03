/**
 * Password hashing off the main thread.
 *
 * bcryptjs is pure JavaScript: one cost-12 compare takes ~400ms of CPU and starves the
 * event loop, so a burst of logins (start of the work day) froze every other request.
 * The work now runs in a small pool of worker threads; the main thread only waits on a
 * promise. If workers cannot be started we fall back to in-process bcryptjs.
 */
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');

const POOL_SIZE = Math.max(1, Math.min(4, os.cpus().length - 1));
const WORKER_FILE = path.join(__dirname, 'password.worker.js');

let workers = [];
let nextWorker = 0;
let nextId = 1;
const pending = new Map();
let workersDisabled = false;

function failPending(worker, err) {
  for (const [id, entry] of pending) {
    if (entry.worker === worker) {
      pending.delete(id);
      entry.reject(err);
    }
  }
}

function spawn() {
  const { Worker } = require('worker_threads');
  const worker = new Worker(WORKER_FILE);
  worker.unref();
  worker.on('message', ({ id, result, error }) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (error) entry.reject(new Error(error)); else entry.resolve(result);
  });
  worker.on('error', (err) => {
    failPending(worker, err);
    workers = workers.filter(w => w !== worker);
  });
  worker.on('exit', () => {
    failPending(worker, new Error('Password worker exited'));
    workers = workers.filter(w => w !== worker);
  });
  return worker;
}

function ensureWorkers() {
  if (workersDisabled) return false;
  try {
    while (workers.length < POOL_SIZE) workers.push(spawn());
    return workers.length > 0;
  } catch (e) {
    console.warn('[password] worker threads unavailable, hashing on main thread:', e.message);
    workersDisabled = true;
    return false;
  }
}

function run(op, args, fallback) {
  if (!ensureWorkers()) return fallback();
  const worker = workers[nextWorker++ % workers.length];
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, worker });
    worker.postMessage({ id, op, args });
  }).catch(() => fallback());
}

function hash(password, rounds = 12) {
  return run('hash', [String(password), rounds], () => bcrypt.hash(String(password), rounds));
}

function compare(password, hashValue) {
  return run('compare', [String(password), String(hashValue || '')], () => bcrypt.compare(String(password), String(hashValue || '')));
}

module.exports = { hash, compare };
