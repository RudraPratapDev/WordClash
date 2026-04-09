require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { setupSockets } = require('./socket/handlers');

const parseCorsOrigins = () => {
  const raw = process.env.CORS_ORIGINS || process.env.CLIENT_URL || '*';
  if (raw === '*') return '*';
  return raw.split(',').map(origin => origin.trim()).filter(Boolean);
};

const corsOrigin = parseCorsOrigins();

const app = express();
app.use(cors({ origin: corsOrigin }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST']
  },
});

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'word-clash-server' });
});

setupSockets(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
