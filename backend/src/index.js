require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const morgan = require('morgan');

const env = require('./config/env');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const sessionRoutes = require('./routes/sessions');
const transcriptRoutes = require('./routes/transcripts');
const { startSession, addAudioChunk, endSession } = require('./services/sessionService');

const app = express();
const server = http.createServer(app);

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(morgan('dev'));

// ── REST Routes ───────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/sessions', sessionRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use(notFound);
app.use(errorHandler);

// ── WebSocket Server ──────────────────────────────────────────
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  logger.info('New WebSocket connection from extension');
  let currentSessionId = null;

  ws.on('message', async (message) => {
    try {
      // Check if it's a binary audio chunk
      if (Buffer.isBuffer(message)) {
        if (!currentSessionId) {
          ws.send(JSON.stringify({ type: 'error', message: 'No active session. Send start_session first.' }));
          return;
        }
        addAudioChunk(currentSessionId, message);
        return;
      }

      // Otherwise parse as JSON control message
      const data = JSON.parse(message.toString());

      if (data.type === 'start_session') {
        const session = await startSession(ws, data.title || null);
        currentSessionId = session.id;
        ws.send(JSON.stringify({ type: 'session_started', sessionId: session.id }));
        logger.info(`Session started via WS: ${session.id}`);
      }

      else if (data.type === 'stop_session') {
        if (!currentSessionId) {
          ws.send(JSON.stringify({ type: 'error', message: 'No active session to stop.' }));
          return;
        }
        ws.send(JSON.stringify({ type: 'processing', message: 'Transcribing audio...' }));
        await endSession(currentSessionId);
        currentSessionId = null;
      }

    } catch (err) {
      logger.error('WebSocket message error:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', async () => {
    logger.info('WebSocket connection closed');
    if (currentSessionId) {
      try {
        await endSession(currentSessionId);
      } catch (err) {
        logger.error('Error ending session on disconnect:', err.message);
      }
    }
  });

  ws.on('error', (err) => {
    logger.error('WebSocket error:', err.message);
  });

  // Send welcome message
  ws.send(JSON.stringify({ type: 'connected', message: 'Meeting Transcriber backend ready' }));
});

// ── Start Server ──────────────────────────────────────────────
server.listen(env.port, () => {
  logger.info(`Server running on port ${env.port} in ${env.nodeEnv} mode`);
  logger.info(`WebSocket server ready at ws://localhost:${env.port}`);
  logger.info(`REST API ready at http://localhost:${env.port}/api`);
});

module.exports = { app, server };