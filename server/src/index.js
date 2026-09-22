/**
 * AMBULERT - Real-time Emergency Mobility Backend
 * Core Server File: Express API + Socket.IO Server Setup
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

// Import services and handlers
const db = require('./services/InMemoryDB');
const alertService = require('./services/AlertService');
const { registerSocketHandlers } = require('./sockets/socketHandler');

// Import routes
const authRoutes = require('./routes/auth');
const tripRoutes = require('./routes/trips');
const hospitalRoutes = require('./routes/hospitals');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);

// Configure Sockets with CORS allowance
const io = socketIo(server, {
  cors: {
    origin: '*', // For development prototypes
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Pass Socket.IO instance to Alert Service for real-time broadcasts
alertService.setSocketIO(io);

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📡 [${req.method}] ${req.url} - ${new Date().toISOString()}`);
  next();
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/admin', adminRoutes);

// Health check and system details
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ONLINE',
    tagline: 'Make way. Save time. Save lives.',
    systemTime: new Date().toISOString(),
    apiVersions: { v1: 'active' }
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('💥 [Server Error Panic]', err);
  res.status(500).json({
    error: 'Internal service error',
    details: err.message
  });
});

// Initialize Port & Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
      ======================================================
      🚑 AMBULERT: emergency mobility engine up and running!
      🏥 API Server: http://localhost:${PORT}
      🔔 WebSockets: Connected & Listening...
      ======================================================
  `);
});

module.exports = { app, server, io };
