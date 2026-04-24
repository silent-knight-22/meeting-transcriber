const express = require('express');
const router = express.Router();
const queries = require('../db/queries');
const logger = require('../utils/logger');

// GET /api/sessions — list all sessions
router.get('/', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const sessions = await queries.getAllSessions(limit, offset);
    res.json({ success: true, data: sessions, count: sessions.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/sessions/:id — get one session
router.get('/:id', async (req, res, next) => {
  try {
    const session = await queries.getSessionById(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

module.exports = router;