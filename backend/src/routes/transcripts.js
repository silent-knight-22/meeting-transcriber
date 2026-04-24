const express = require('express');
const router = express.Router();
const queries = require('../db/queries');

// GET /api/transcripts/:sessionId — get full transcript for a session
router.get('/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await queries.getSessionById(sessionId);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const utterances = await queries.getUtterancesBySession(sessionId);
    res.json({ success: true, data: { session, utterances } });
  } catch (err) {
    next(err);
  }
});

// GET /api/transcripts/:sessionId/export — export as plain text
router.get('/:sessionId/export', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await queries.getSessionById(sessionId);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const utterances = await queries.getUtterancesBySession(sessionId);

    const lines = utterances.map((u) => {
      const time = new Date(u.start_ms).toISOString().substr(11, 8);
      return `[${time}] ${u.speaker}: ${u.text}`;
    });

    const text = `Meeting Transcript\nSession: ${sessionId}\nDate: ${session.started_at}\n\n${lines.join('\n')}`;
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="transcript-${sessionId}.txt"`);
    res.send(text);
  } catch (err) {
    next(err);
  }
});

module.exports = router;