const { parentPort } = require('worker_threads');
const bcrypt = require('bcryptjs');

parentPort.on('message', ({ id, op, args }) => {
  try {
    const result = op === 'hash'
      ? bcrypt.hashSync(args[0], args[1])
      : bcrypt.compareSync(args[0], args[1]);
    parentPort.postMessage({ id, result });
  } catch (e) {
    parentPort.postMessage({ id, error: e.message });
  }
});
