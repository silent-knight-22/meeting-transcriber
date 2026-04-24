const db = require('../config/db');

// Session queries
const createSession = async (title = null) => {
  const result = await db.query(
    'INSERT INTO sessions (title) VALUES ($1) RETURNING *',
    [title]
  );
  return result.rows[0];
};

const updateSession = async (id, fields) => {
  const { ended_at, status, speaker_count, total_duration_ms } = fields;
  const result = await db.query(
    `UPDATE sessions
     SET ended_at = $1, status = $2, speaker_count = $3, total_duration_ms = $4
     WHERE id = $5 RETURNING *`,
    [ended_at, status, speaker_count, total_duration_ms, id]
  );
  return result.rows[0];
};

const getSessionById = async (id) => {
  const result = await db.query('SELECT * FROM sessions WHERE id = $1', [id]);
  return result.rows[0] || null;
};

const getAllSessions = async (limit = 20, offset = 0) => {
  const result = await db.query(
    'SELECT * FROM sessions ORDER BY started_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return result.rows;
};

// Utterance queries
const insertUtterance = async ({ session_id, speaker, text, start_ms, end_ms, confidence }) => {
  const result = await db.query(
    `INSERT INTO utterances (session_id, speaker, text, start_ms, end_ms, confidence)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [session_id, speaker, text, start_ms, end_ms, confidence]
  );
  return result.rows[0];
};

const getUtterancesBySession = async (session_id) => {
  const result = await db.query(
    'SELECT * FROM utterances WHERE session_id = $1 ORDER BY start_ms ASC',
    [session_id]
  );
  return result.rows;
};

module.exports = {
  createSession,
  updateSession,
  getSessionById,
  getAllSessions,
  insertUtterance,
  getUtterancesBySession,
};