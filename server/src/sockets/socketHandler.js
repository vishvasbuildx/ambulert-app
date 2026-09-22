/**
 * AMBULERT - Real-time Sockets Handler
 */

const jwt = require('jsonwebtoken');
const db = require('../services/InMemoryDB');
const alertService = require('../services/AlertService');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_session_key_for_ambulert_jwt_tokens';

function registerSocketHandlers(io) {
  io.use((socket, next) => {
    // Authenticate socket connections using JWT tokens passed in handshake queries
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      // Allow anonymous connection for demo simulation, but won't be joined to roles
      socket.user = null;
      return next();
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        // Return success but unauthenticated, so socket drops role assignment gracefully
        socket.user = null;
        return next();
      }

      const user = db.users.get(decoded.id);
      if (user) {
        socket.user = user;
      }
      next();
    });
  });

  io.on('connection', (socket) => {
    const userOrAnon = socket.user ? `${socket.user.name} (${socket.user.role})` : 'Anonymous Client';
    console.log(`🔌 [SOCKET CONNECTED] Connection established for: ${userOrAnon} | ID: ${socket.id}`);

    // Assign user to appropriate real-time room channels
    if (socket.user) {
      if (socket.user.role === 'DRIVER') {
        socket.join(`driver:${socket.user.id}`);
        console.log(`👤 Socket assigned to Driver room: driver:${socket.user.id}`);
      } else if (socket.user.role === 'ADMIN') {
        socket.join('admin');
        console.log('👮 Socket assigned to Administrator panel room');
      } else {
        // Standard Citizen client room
        socket.join(`citizen:${socket.user.id}`);
        console.log(`👤 Socket assigned to Citizen channel: citizen:${socket.user.id}`);
      }
    }

    // Citizen client explicitly joins a simulation coordinates room for listening to specific ambulance runs
    socket.on('join_citizen_room', (citizenId) => {
      socket.join(`citizen:${citizenId}`);
      console.log(`⚡ Connected simulation client manual room binding: citizen:${citizenId}`);
    });

    // Join Admin workspace
    socket.on('join_admin_room', () => {
      socket.join('admin');
      console.log('⚡ Connected admin simulation client room binding: admin');
    });

    socket.on('disconnect', () => {
      console.log(`🔌 [SOCKET DISCONNECTED] Client detached: ${socket.id}`);
    });
  });
}

module.exports = {
  registerSocketHandlers
};
