const { Server } = require('socket.io');
const config = require('./config');

let io = null;
// socket.id -> { deviceName, connectedAt, status }
const agents = new Map();

const agentList = () =>
  [...agents.values()].map((a) => ({ deviceName: a.deviceName, connectedAt: a.connectedAt, status: a.status }));

const broadcastAgents = () => io && io.emit('agents', agentList());

function initRealtime(httpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } });

  io.use((socket, next) => {
    if (socket.handshake.auth?.apiKey !== config.apiKey) return next(new Error('unauthorized'));
    next();
  });

  io.on('connection', (socket) => {
    const { role, deviceName } = socket.handshake.auth;

    if (role === 'agent') {
      agents.set(socket.id, { deviceName: deviceName || 'Laptop', connectedAt: new Date().toISOString(), status: {} });
      broadcastAgents();
      socket.on('agent:status', (status) => {
        const agent = agents.get(socket.id);
        if (agent) {
          agent.status = status || {};
          broadcastAgents();
        }
      });
      socket.on('disconnect', () => {
        agents.delete(socket.id);
        broadcastAgents();
      });
    }

    socket.emit('agents', agentList());
  });

  return io;
}

/** Send an event to every connected app (mobile + desktop). */
function emit(event, payload) {
  if (io) io.emit(event, payload);
}

module.exports = { initRealtime, emit, agentList };
