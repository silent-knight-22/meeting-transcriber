// Background Service Worker (MV3)

const OFFSCREEN_URL = chrome.runtime.getURL('src/offscreen.html');

let state = {
  isRecording: false,
  sessionId: null,
  meetingPlatform: null,
  meetingTitle: null,
};

// ── Offscreen document ────────────────────────────────────────
const ensureOffscreen = async () => {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['USER_MEDIA'],
      justification: 'Capture tab audio for meeting transcription',
    });
    await new Promise(r => setTimeout(r, 500));
  }
};

const closeOffscreen = async () => {
  try {
    const exists = await chrome.offscreen.hasDocument();
    if (exists) await chrome.offscreen.closeDocument();
  } catch (e) {}
};

// ── Message router ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // FROM offscreen doc → forward backend messages to popup
  if (message.type === 'FROM_BACKEND') {
    handleBackendMessage(message.raw);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'WS_CLOSED') {
    if (state.isRecording) {
      state.isRecording = false;
      chrome.storage.local.set({ isRecording: false });
    }
    broadcastToPopup({ type: 'WS_DISCONNECTED' });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'CAPTURE_ERROR') {
    broadcastToPopup({ type: 'ERROR', message: message.message });
    sendResponse({ ok: true });
    return true;
  }

  // FROM popup
  (async () => {
    try {
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
          await startRecording(message.tabId, message.meetingInfo);
          sendResponse({ success: true });
          break;

        case 'STOP_RECORDING':
          await stopRecording();
          sendResponse({ success: true });
          break;

        case 'MEETING_DETECTED':
          state.meetingPlatform = message.platform;
          state.meetingTitle = message.title;
          broadcastToPopup({ type: 'MEETING_DETECTED', platform: message.platform, title: message.title });
          sendResponse({ ok: true });
          break;

        case 'MEETING_ENDED':
          if (state.isRecording) await stopRecording();
          state.meetingPlatform = null;
          broadcastToPopup({ type: 'MEETING_ENDED' });
          sendResponse({ ok: true });
          break;

        default:
          sendResponse({ ok: true });
      }
    } catch (err) {
      console.error('[BG] Handler error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true;
});

// ── Backend message handler ───────────────────────────────────
const handleBackendMessage = (raw) => {
  try {
    const data = JSON.parse(raw);
    console.log('[BG] Backend msg:', data.type, data.message || '');

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
        console.error('[BG] Backend error:', data.message);
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

  // tabCapture.getMediaStreamId MUST run in background service worker
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

  console.log('[BG] Got streamId:', streamId.substring(0, 20) + '...');

  // Create offscreen doc BEFORE sending message
  await ensureOffscreen();

  // Tell offscreen to connect WS + start capturing
  const response = await chrome.runtime.sendMessage({
    type: 'START_CAPTURE',
    streamId,
    title: meetingInfo?.title || 'Meeting Recording',
    target: 'offscreen', // helps route the message
  });

  if (response && response.success === false) {
    throw new Error(response.error || 'Offscreen capture failed');
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
    await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE', target: 'offscreen' });
  } catch (e) {
    console.warn('[BG] Stop capture msg error (offscreen may be closed):', e.message);
  }

  state.isRecording = false;
  await chrome.storage.local.set({ isRecording: false });
  broadcastToPopup({ type: 'RECORDING_STOPPED' });

  setTimeout(() => closeOffscreen(), 3000);
};

// ── Broadcast to popup ────────────────────────────────────────
const broadcastToPopup = (message) => {
  chrome.runtime.sendMessage(message).catch(() => {});
};

console.log('[BG] Service worker started');