const { EventEmitter } = require('events');

const realtimeBus = new EventEmitter();
// Each open chat/SSE tab adds listeners; don't cap (and warn) as the team grows.
realtimeBus.setMaxListeners(0);

function publish(event, payload) {
  realtimeBus.emit(event, payload);
}

function subscribe(event, listener) {
  realtimeBus.on(event, listener);
  return () => realtimeBus.off(event, listener);
}

module.exports = {
  publish,
  subscribe
};
