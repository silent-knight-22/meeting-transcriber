const { AssemblyAI } = require('assemblyai');
const env = require('../config/env');
const logger = require('../utils/logger');

const client = new AssemblyAI({ apiKey: env.assemblyaiApiKey });

/**
 * Transcribe a complete audio buffer with speaker diarization.
 * Used when a recording session ends and we have the full audio.
 */
const transcribeWithDiarization = async (audioBuffer) => {
  try {
    logger.info('Submitting audio to AssemblyAI for transcription...');

    const transcript = await client.transcripts.transcribe({
      audio: audioBuffer,
      speaker_labels: true,       // Enable speaker diarization
      speakers_expected: 2,       // Hint: most meetings have 2+ speakers
      punctuate: true,
      format_text: true,
    });

    if (transcript.status === 'error') {
      throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
    }

    logger.info(`Transcription complete — ${transcript.utterances?.length || 0} utterances`);
    return transcript;
  } catch (err) {
    logger.error('AssemblyAI error:', err.message);
    throw err;
  }
};

/**
 * Create a real-time streaming transcriber.
 * Returns a RealtimeTranscriber instance the caller can wire up.
 */
const createRealtimeTranscriber = () => {
  return client.realtime.transcriber({
    sample_rate: 16000,
    word_boost: [],
    encoding: 'pcm_s16le',
  });
};

module.exports = { transcribeWithDiarization, createRealtimeTranscriber };