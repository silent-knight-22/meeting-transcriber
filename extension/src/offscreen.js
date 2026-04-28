// Offscreen document — full DOM access, handles getUserMedia + WebSocket

const BACKEND_WS_URL = 'ws://localhost:3001';

let ws = null;
let mediaRecorder = null;
let captureStream = null;
let pendingStreamId = null;

// ── WebSocket connection ──────────────────────────────────────
const connectWS = () => {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(BACKEND_WS_URL);

    ws.onopen = () => {
      console.log('[Offscreen] WS connected to backend');
      resolve();
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Offscreen] Backend:', data.type);

        if (data.type === 'session_started') {
          // NOW safe to start audio — session is confirmed on backend
          console.log('[Offscreen] Session confirmed:', data.sessionId, '— starting capture');
          try {
            await startAudioCapture(pendingStreamId);
          } catch (err) {
            console.error('[Offscreen] Audio capture failed:', err);
            chrome.runtime.sendMessage({
              type: 'FROM_BACKEND',
              raw: JSON.stringify({ type: 'error', message: 'Audio capture failed: ' + err.message }),
            });
            return;
          }
        }

        // Forward ALL backend messages to background worker
        chrome.runtime.sendMessage({ type: 'FROM_BACKEND', raw: event.data }).catch(() => {});

      } catch (e) {
        console.error('[Offscreen] Message parse error:', e);
      }
    };

    ws.onerror = (e) => {
      console.error('[Offscreen] WS error');
      reject(new Error('Cannot connect to backend at ws://localhost:3001 — is Docker running?'));
    };

    ws.onclose = () => {
      console.log('[Offscreen] WS closed');
      chrome.runtime.sendMessage({ type: 'WS_CLOSED' }).catch(() => {});
    };
  });
};

// ── Audio capture ─────────────────────────────────────────────
const startAudioCapture = async (streamId) => {
  if (!streamId) throw new Error('No streamId provided');

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  captureStream = stream;

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';

  console.log('[Offscreen] Using mimeType:', mimeType);

  mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    audioBitsPerSecond: 16000,
  });

  mediaRecorder.ondataavailable = async (event) => {
    if (event.data && event.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
      try {
        const buffer = await event.data.arrayBuffer();
        ws.send(buffer);
      } catch (e) {
        console.error('[Offscreen] Send error:', e);
      }
    }
  };

  mediaRecorder.onerror = (err) => {
    console.error('[Offscreen] MediaRecorder error:', err);
    chrome.runtime.sendMessage({
      type: 'FROM_BACKEND',
      raw: JSON.stringify({ type: 'error', message: 'MediaRecorder error: ' + err.message }),
    }).catch(() => {});
  };

  mediaRecorder.start(500); // 500ms chunks — more stable than 250ms
  console.log('[Offscreen] MediaRecorder started');
};

// ── Stop capture ──────────────────────────────────────────────
const stopCapture = () => {
  console.log('[Offscreen] Stopping capture...');
  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  } catch (e) {}
  try {
    if (captureStream) {
      captureStream.getTracks().forEach(t => t.stop());
    }
  } catch (e) {}
  mediaRecorder = null;
  captureStream = null;
};

// ── Message listener ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle messages targeted at offscreen
  if (message.target && message.target !== 'offscreen') {
    return false;
  }

  // Also handle untargeted offscreen-specific messages
  if (message.type !== 'START_CAPTURE' && message.type !== 'STOP_CAPTURE') {
    return false;
  }

  (async () => {
    try {
      if (message.type === 'START_CAPTURE') {
        pendingStreamId = message.streamId;

        // Connect WS first
        await connectWS();

        // Send start_session — audio starts ONLY after session_started reply
        ws.send(JSON.stringify({
          type: 'start_session',
          title: message.title || 'Meeting Recording',
        }));

        console.log('[Offscreen] start_session sent — waiting for backend confirmation');
        sendResponse({ success: true });
      }

      else if (message.type === 'STOP_CAPTURE') {
        stopCapture();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'stop_session' }));
          console.log('[Offscreen] stop_session sent');
        }
        sendResponse({ success: true });
      }
    } catch (err) {
      console.error('[Offscreen] Error handling message:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // keep channel open for async sendResponse
});

console.log('[Offscreen] Ready');