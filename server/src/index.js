require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { setupSockets } = require('./socket/handlers');
const { connectMongo, isMongoReady } = require('./db/mongo');
const cookieParser = require('cookie-parser');
const adminRoutes = require('./routes/admin');
const feedbackRoutes = require('./routes/feedback');

const parseCorsOrigins = () => {
  const raw = process.env.CORS_ORIGINS || process.env.CLIENT_URL || '*';
  if (raw === '*') return '*';
  return raw.split(',').map(origin => origin.trim()).filter(Boolean);
};

const corsDelegate = (req, callback) => {
  if (corsOrigin === '*') {
    // When CORS_ORIGINS is wildcard, do NOT reflect credentials — use explicit origin reflection
    // to avoid the browser blocking credentialed requests to a wildcard origin.
    callback(null, { origin: true, credentials: true });
    return;
  }

  const requestOrigin = req.header('Origin');
  const allow = !requestOrigin || corsOrigin.includes(requestOrigin);
  callback(null, {
    origin: allow,
    credentials: true,
  });
};

const corsOrigin = parseCorsOrigins();

const app = express();
app.use(cors(corsDelegate));
app.use(express.json());
app.use(cookieParser());

const server = http.createServer(app);

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST']
  },
});

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'word-clash-server',
    mongodb: isMongoReady() ? 'connected' : 'disconnected',
  });
});

app.use('/api/admin', adminRoutes);
app.use('/api/feedback', feedbackRoutes);

// Warn at startup if admin credentials are not properly configured
const adminPassword = process.env.ADMIN_PASSWORD;
const adminJwtSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
if (!adminPassword || adminPassword.length < 12 || !adminJwtSecret || adminJwtSecret.length < 24) {
  console.warn('[WARN] Admin panel is DISABLED: ADMIN_PASSWORD (min 12 chars) and ADMIN_JWT_SECRET (min 24 chars) must both be set in environment variables.');
}

setupSockets(io);

// Do not block server start on DB availability. Gameplay remains live even if
// Mongo reconnects later; report submissions will fail gracefully meanwhile.
connectMongo();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
