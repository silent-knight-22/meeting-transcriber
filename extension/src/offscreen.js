// Offscreen document — has full DOM access including getUserMedia

const BACKEND_WS_URL = 'ws://localhost:3001';

let ws = null;
let mediaRecorder = null;
let captureStream = null;
let pendingStreamId = null;
let pendingTitle = null;

// ── WebSocket ─────────────────────────────────────────────────
const connectWS = () => {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(BACKEND_WS_URL);

    ws.onopen = () => {
      console.log('[Offscreen] WS connected');
      resolve();
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Offscreen] Backend msg:', data.type);

        // ← KEY FIX: only start audio AFTER backend confirms session started
        if (data.type === 'session_started') {
          console.log('[Offscreen] Session confirmed, starting audio capture...');
          try {
            await startAudioCapture(pendingStreamId);
            chrome.runtime.sendMessage({ type: 'FROM_BACKEND', raw: event.data });
          } catch (err) {
            chrome.runtime.sendMessage({
              type: 'FROM_BACKEND',
              raw: JSON.stringify({ type: 'error', message: err.message })
            });
          }
        } else {
          // Forward all other messages to background
          chrome.runtime.sendMessage({ type: 'FROM_BACKEND', raw: event.data });
        }
      } catch (e) {
        console.error('[Offscreen] Parse error:', e);
      }
    };

    ws.onerror = (e) => {
      console.error('[Offscreen] WS error:', e);
      reject(new Error('WebSocket connection failed — is Docker running?'));
    };

    ws.onclose = () => {
      console.log('[Offscreen] WS closed');
      chrome.runtime.sendMessage({ type: 'WS_CLOSED' });
    };
  });
};

// ── Audio capture (called AFTER session_started confirmed) ────
const startAudioCapture = async (streamId) => {
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

  mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    audioBitsPerSecond: 16000,
  });

  mediaRecorder.ondataavailable = async (event) => {
    if (event.data?.size > 0 && ws?.readyState === WebSocket.OPEN) {
      const buffer = await event.data.arrayBuffer();
      ws.send(buffer);
    }
  };

  mediaRecorder.onerror = (err) => {
    console.error('[Offscreen] MediaRecorder error:', err);
    chrome.runtime.sendMessage({
      type: 'FROM_BACKEND',
      raw: JSON.stringify({ type: 'error', message: 'Audio capture error: ' + err.message })
    });
  };

  mediaRecorder.start(250);
  console.log('[Offscreen] MediaRecorder started, mimeType:', mimeType);
};

// ── Stop capture ──────────────────────────────────────────────
const stopCapture = () => {
  if (mediaRecorder?.state !== 'inactive') {
    mediaRecorder?.stop();
  }
  captureStream?.getTracks().forEach(t => t.stop());
  mediaRecorder = null;
  captureStream = null;
};

// ── Message listener (from background worker) ─────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'START_CAPTURE') {
        // Store streamId — we'll use it after session_started is confirmed
        pendingStreamId = message.streamId;
        pendingTitle = message.title || 'Meeting Recording';

        // Step 1: Connect WebSocket
        await connectWS();

        // Step 2: Tell backend to start session
        // Audio capture starts ONLY after we receive session_started back
        ws.send(JSON.stringify({
          type: 'start_session',
          title: pendingTitle,
        }));

        console.log('[Offscreen] start_session sent, waiting for confirmation...');
        sendResponse({ success: true });
      }

      else if (message.type === 'STOP_CAPTURE') {
        stopCapture();
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'stop_session' }));
        }
        sendResponse({ success: true });
      }

    } catch (err) {
      console.error('[Offscreen] Error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true;
});

console.log('[Offscreen] Document ready');