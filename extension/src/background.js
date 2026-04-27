// Background Service Worker (MV3)
// Orchestrates offscreen document for audio capture + WebSocket

const OFFSCREEN_URL = chrome.runtime.getURL('src/offscreen.html');

let state = {
  isRecording: false,
  sessionId: null,
  meetingPlatform: null,
  meetingTitle: null,
  offscreenReady: false,
};

// ── Offscreen document management ────────────────────────────
const ensureOffscreen = async () => {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['USER_MEDIA'],
      justification: 'Capture tab audio for meeting transcription',
    });
    // Small delay for offscreen doc to initialize
    await new Promise(r => setTimeout(r, 300));
  }
};

const closeOffscreen = async () => {
  const exists = await chrome.offscreen.hasDocument();
  if (exists) await chrome.offscreen.closeDocument();
};

// ── Messages FROM offscreen doc ───────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Messages from offscreen document
  if (message.type === 'FROM_BACKEND') {
    handleBackendMessage(message.raw);
    return;
  }
  if (message.type === 'WS_CLOSED') {
    broadcastToPopup({ type: 'WS_DISCONNECTED' });
    return;
  }
  if (message.type === 'CAPTURE_ERROR') {
    broadcastToPopup({ type: 'ERROR', message: message.message });
    return;
  }

  // Messages from popup
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
          console.error('[BG] Start error:', err);
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
  return true;
});

// ── Backend message handler ───────────────────────────────────
const handleBackendMessage = (raw) => {
  try {
    const data = JSON.parse(raw);
    console.log('[BG] Backend msg:', data.type);

    switch (data.type) {
      case 'session_started':
        state.sessionId = data.sessionId;
        broadcastToPopup({ type: 'SESSION_STARTED', sessionId: data.sessionId });
        break;
      case 'processing':
        broadcastToPopup({ type: 'PROCESSING', message: data.message });
        break;
      case 'transcript_complete':
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
  } catch (e) {
    console.error('[BG] Parse error:', e);
  }
};

// ── Start recording ───────────────────────────────────────────
const startRecording = async (tabId, meetingInfo) => {
  if (state.isRecording) throw new Error('Already recording');

  // Get stream ID from tabCapture (must be in background)
  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId(
      { targetTabId: tabId },
      (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(id);
        }
      }
    );
  });

  console.log('[BG] Got streamId:', streamId);

  // Create offscreen document to do actual capture
  await ensureOffscreen();

  // Send streamId to offscreen doc
  const response = await chrome.runtime.sendMessage({
    type: 'START_CAPTURE',
    streamId,
    title: meetingInfo?.title || 'Meeting Recording',
  });

  if (!response?.success) {
    throw new Error(response?.error || 'Offscreen capture failed');
  }

  state.isRecording = true;
  state.meetingPlatform = meetingInfo?.platform;
  state.meetingTitle = meetingInfo?.title;

  await chrome.storage.local.set({ isRecording: true });
  broadcastToPopup({ type: 'RECORDING_STARTED' });
  console.log('[BG] Recording started successfully');
};

// ── Stop recording ────────────────────────────────────────────
const stopRecording = async () => {
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });
  } catch (e) {
    console.warn('[BG] Stop capture error:', e);
  }

  state.isRecording = false;
  await chrome.storage.local.set({ isRecording: false });
  broadcastToPopup({ type: 'RECORDING_STOPPED' });

  // Close offscreen doc after short delay
  setTimeout(() => closeOffscreen(), 2000);
};

// ── Broadcast to popup ────────────────────────────────────────
const broadcastToPopup = (message) => {
  chrome.runtime.sendMessage(message).catch(() => {});
};

console.log('[BG] Service worker started');