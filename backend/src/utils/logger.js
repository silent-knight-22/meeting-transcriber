const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = process.env.NODE_ENV === 'production' ? 2 : 3;

const format = (level, message, meta) => {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
};

const logger = {
  error: (message, meta) => {
    if (LOG_LEVELS.error <= CURRENT_LEVEL)
      console.error(format('error', message, meta));
  },
  warn: (message, meta) => {
    if (LOG_LEVELS.warn <= CURRENT_LEVEL)
      console.warn(format('warn', message, meta));
  },
  info: (message, meta) => {
    if (LOG_LEVELS.info <= CURRENT_LEVEL)
      console.log(format('info', message, meta));
  },
  debug: (message, meta) => {
    if (LOG_LEVELS.debug <= CURRENT_LEVEL)
      console.log(format('debug', message, meta));
  },
};

module.exports = logger;