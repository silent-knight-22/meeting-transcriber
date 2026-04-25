// Background Service Worker
// Manages audio capture, WebSocket connection to backend, and state

const BACKEND_WS_URL = 'ws://localhost:3001';
const BACKEND_HTTP_URL = 'http://localhost:3001';

// Extension state
let state = {
  isRecording: false,
  sessionId: null,
  meetingPlatform: null,
  meetingTitle: null,
  ws: null,
  mediaRecorder: null,
  captureStream: null,
  transcript: [],
  connectedTabId: null,
};

// ── WebSocket Management ─────────────────────────────────────

const connectWebSocket = () => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BACKEND_WS_URL);

    ws.onopen = () => {
      console.log('[MeetingTranscriber] WebSocket connected to backend');
      state.ws = ws;
      resolve(ws);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleBackendMessage(data);
      } catch (e) {
        console.error('[MeetingTranscriber] WS parse error:', e);
      }
    };

    ws.onerror = (err) => {
      console.error('[MeetingTranscriber] WebSocket error:', err);
      reject(err);
    };

    ws.onclose = () => {
      console.log('[MeetingTranscriber] WebSocket disconnected');
      state.ws = null;
      // Notify popup of disconnection
      broadcastToPopup({ type: 'WS_DISCONNECTED' });
    };
  });
};

const handleBackendMessage = (data) => {
  console.log('[MeetingTranscriber] Backend message:', data.type);

  switch (data.type) {
    case 'session_started':
      state.sessionId = data.sessionId;
      broadcastToPopup({ type: 'SESSION_STARTED', sessionId: data.sessionId });
      break;

    case 'processing':
      broadcastToPopup({ type: 'PROCESSING', message: data.message });
      break;

    case 'transcript_complete':
      state.transcript = data.utterances || [];
      // Save to chrome.storage for popup to read
      chrome.storage.local.set({
        [`transcript_${data.sessionId}`]: data.utterances,
        lastSessionId: data.sessionId,
      });
      broadcastToPopup({ type: 'TRANSCRIPT_READY', utterances: data.utterances, sessionId: data.sessionId });
      break;

    case 'error':
      broadcastToPopup({ type: 'BACKEND_ERROR', message: data.message });
      break;

    case 'connected':
      broadcastToPopup({ type: 'WS_CONNECTED' });
      break;
  }
};

// ── Audio Capture ────────────────────────────────────────────

const startCapture = async (tabId) => {
  try {
    // tabCapture captures the tab's audio output
    const stream = await new Promise((resolve, reject) => {
      chrome.tabCapture.capture(
        { audio: true, video: false },
        (captureStream) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!captureStream) {
            reject(new Error('Failed to capture tab audio — no stream returned'));
          } else {
            resolve(captureStream);
          }
        }
      );
    });

    state.captureStream = stream;

    // Use MediaRecorder to chunk the audio
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 16000,
    });

    mediaRecorder.ondataavailable = async (event) => {
      if (event.data && event.data.size > 0 && state.ws && state.ws.readyState === WebSocket.OPEN) {
        // Convert blob to ArrayBuffer and send as binary
        const buffer = await event.data.arrayBuffer();
        state.ws.send(buffer);
      }
    };

    // Send audio chunks every 250ms for near-real-time processing
    mediaRecorder.start(250);
    state.mediaRecorder = mediaRecorder;
    state.connectedTabId = tabId;

    console.log('[MeetingTranscriber] Audio capture started');
    return true;
  } catch (err) {
    console.error('[MeetingTranscriber] Capture error:', err);
    throw err;
  }
};

const stopCapture = () => {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
  if (state.captureStream) {
    state.captureStream.getTracks().forEach((t) => t.stop());
  }
  state.mediaRecorder = null;
  state.captureStream = null;
};

// ── Main Recording Control ───────────────────────────────────

const startRecording = async (tabId, meetingInfo) => {
  try {
    if (state.isRecording) throw new Error('Already recording');

    // Connect WebSocket
    await connectWebSocket();

    // Tell backend to start a new session
    state.ws.send(JSON.stringify({
      type: 'start_session',
      title: meetingInfo?.title || 'Meeting Recording',
    }));

    // Start audio capture
    await startCapture(tabId);

    state.isRecording = true;
    state.meetingPlatform = meetingInfo?.platform;
    state.meetingTitle = meetingInfo?.title;

    // Save recording state
    await chrome.storage.local.set({ isRecording: true });

    broadcastToPopup({ type: 'RECORDING_STARTED' });
    console.log('[MeetingTranscriber] Recording started');
  } catch (err) {
    console.error('[MeetingTranscriber] Start recording error:', err);
    broadcastToPopup({ type: 'ERROR', message: err.message });
    throw err;
  }
};

const stopRecording = async () => {
  try {
    stopCapture();

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: 'stop_session' }));
    }

    state.isRecording = false;
    await chrome.storage.local.set({ isRecording: false });

    broadcastToPopup({ type: 'RECORDING_STOPPED' });
    console.log('[MeetingTranscriber] Recording stopped — awaiting transcription');
  } catch (err) {
    console.error('[MeetingTranscriber] Stop recording error:', err);
    broadcastToPopup({ type: 'ERROR', message: err.message });
  }
};

// ── Popup Communication ──────────────────────────────────────

const broadcastToPopup = (message) => {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might be closed — that's fine
  });
};

// ── Message Listener (from popup) ───────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'GET_STATE':
        sendResponse({
          isRecording: state.isRecording,
          sessionId: state.sessionId,
          meetingPlatform: state.meetingPlatform,
          meetingTitle: state.meetingTitle,
        });
        break;

      case 'START_RECORDING':
        try {
          await startRecording(message.tabId, message.meetingInfo);
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        break;

      case 'STOP_RECORDING':
        await stopRecording();
        sendResponse({ success: true });
        break;

      case 'MEETING_DETECTED':
        state.meetingPlatform = message.platform;
        state.meetingTitle = message.title;
        broadcastToPopup({ type: 'MEETING_DETECTED', platform: message.platform, title: message.title });
        break;

      case 'MEETING_ENDED':
        if (state.isRecording) await stopRecording();
        state.meetingPlatform = null;
        broadcastToPopup({ type: 'MEETING_ENDED' });
        break;
    }
  })();
  return true; // keep message channel open for async response
});

console.log('[MeetingTranscriber] Background service worker started');