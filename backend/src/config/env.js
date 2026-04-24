require('dotenv').config();

const env = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  assemblyaiApiKey: process.env.ASSEMBLYAI_API_KEY,
  databaseUrl: process.env.DATABASE_URL,
};

if (!env.assemblyaiApiKey) {
  throw new Error('ASSEMBLYAI_API_KEY is required in .env');
}

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is required in .env');
}

module.exports = env;