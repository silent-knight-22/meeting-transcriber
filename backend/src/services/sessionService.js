const queries = require('../db/queries');
const { transcribeWithDiarization } = require('./assemblyai');
const logger = require('../utils/logger');

// In-memory map of active sessions: sessionId -> { audioChunks, startTime, ws }
const activeSessions = new Map();

const startSession = async (ws, title = null) => {
  const session = await queries.createSession(title);
  activeSessions.set(session.id, {
    audioChunks: [],
    startTime: Date.now(),
    ws,
  });
  logger.info(`Session started: ${session.id}`);
  return session;
};

const addAudioChunk = (sessionId, chunk) => {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error(`No active session: ${sessionId}`);
  session.audioChunks.push(chunk);
};

const endSession = async (sessionId) => {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error(`No active session: ${sessionId}`);

  const { audioChunks, startTime, ws } = session;
  const totalDurationMs = Date.now() - startTime;

  logger.info(`Ending session ${sessionId} — ${audioChunks.length} chunks received`);

  // Combine all audio chunks into one buffer
  const audioBuffer = Buffer.concat(audioChunks);

  let utterances = [];
  let speakerCount = 0;

  try {
    // Send to AssemblyAI for full transcription with diarization
    const transcript = await transcribeWithDiarization(audioBuffer);
    utterances = transcript.utterances || [];
    const speakers = new Set(utterances.map((u) => u.speaker));
    speakerCount = speakers.size;

    // Save each utterance to DB
    for (const u of utterances) {
      await queries.insertUtterance({
        session_id: sessionId,
        speaker: u.speaker,
        text: u.text,
        start_ms: u.start,
        end_ms: u.end,
        confidence: u.confidence,
      });
    }

    // Push live transcript to extension via WebSocket
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'transcript_complete',
        sessionId,
        utterances,
      }));
    }
  } catch (err) {
    logger.error(`Transcription failed for session ${sessionId}:`, err.message);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  }

  // Update session record in DB
  const updated = await queries.updateSession(sessionId, {
    ended_at: new Date(),
    status: 'completed',
    speaker_count: speakerCount,
    total_duration_ms: totalDurationMs,
  });

  activeSessions.delete(sessionId);
  logger.info(`Session ${sessionId} closed — ${speakerCount} speakers detected`);
  return { session: updated, utterances };
};

module.exports = { startSession, addAudioChunk, endSession };