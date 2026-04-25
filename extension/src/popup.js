// Popup script — drives the extension UI

const BACKEND_HTTP = 'http://localhost:3001';

// ── DOM refs ─────────────────────────────────────────────────
const statusDot     = document.getElementById('statusDot');
const statusText    = document.getElementById('statusText');
const meetingInfo   = document.getElementById('meetingInfo');
const meetingPlatform = document.getElementById('meetingPlatform');
const meetingTitle  = document.getElementById('meetingTitle');
const btnRecord     = document.getElementById('btnRecord');
const btnStop       = document.getElementById('btnStop');
const btnSessions   = document.getElementById('btnSessions');
const transcriptBox = document.getElementById('transcriptBox');
const emptyState    = document.getElementById('emptyState');
const utteranceCount = document.getElementById('utteranceCount');
const processingState = document.getElementById('processingState');
const processingText  = document.getElementById('processingText');
const exportLink    = document.getElementById('exportLink');
const sessionIdDisplay = document.getElementById('sessionIdDisplay');

// ── State ─────────────────────────────────────────────────────
let currentState = {
  isRecording: false,
  sessionId: null,
  backendOnline: false,
  meetingDetected: false,
};

// Speaker color assignment
const speakerColors = {};
const colorClasses = ['speaker-A', 'speaker-B', 'speaker-C', 'speaker-D'];
let colorIndex = 0;

const getSpeakerColor = (speaker) => {
  if (!speakerColors[speaker]) {
    speakerColors[speaker] = colorClasses[colorIndex % colorClasses.length];
    colorIndex++;
  }
  return speakerColors[speaker];
};

// ── UI Helpers ────────────────────────────────────────────────
const setStatus = (text, type = 'idle') => {
  statusText.textContent = text;
  statusDot.className = `status-dot ${type}`;
};

const showProcessing = (text = 'Transcribing audio...') => {
  processingState.classList.add('visible');
  processingText.textContent = text;
  transcriptBox.style.display = 'none';
};

const hideProcessing = () => {
  processingState.classList.remove('visible');
  transcriptBox.style.display = 'block';
};

const setRecordingUI = (recording) => {
  if (recording) {
    btnRecord.style.display = 'none';
    btnStop.style.display = 'flex';
    btnStop.disabled = false;
    setStatus('Recording in progress...', 'recording');
  } else {
    btnRecord.style.display = 'flex';
    btnStop.style.display = 'none';
    btnRecord.disabled = !currentState.backendOnline;
    setStatus(currentState.backendOnline ? 'Ready to record' : 'Backend offline', 
              currentState.backendOnline ? 'connected' : '');
  }
};

const formatTime = (ms) => {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
  const secs = (totalSecs % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
};

const renderTranscript = (utterances) => {
  if (!utterances || utterances.length === 0) {
    emptyState.style.display = 'block';
    utteranceCount.textContent = '0 utterances';
    return;
  }

  emptyState.style.display = 'none';
  utteranceCount.textContent = `${utterances.length} utterance${utterances.length !== 1 ? 's' : ''}`;

  // Clear and rebuild
  const existing = transcriptBox.querySelectorAll('.utterance');
  existing.forEach(el => el.remove());

  utterances.forEach((u) => {
    const div = document.createElement('div');
    div.className = 'utterance';

    const colorClass = getSpeakerColor(u.speaker);
    div.innerHTML = `
      <div class="utterance-header">
        <span class="speaker-badge ${colorClass}">${u.speaker}</span>
        <span class="utterance-time">${formatTime(u.start_ms || u.start || 0)}</span>
      </div>
      <div class="utterance-text">${u.text}</div>
    `;
    transcriptBox.appendChild(div);
  });

  // Scroll to bottom
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
};

// ── Backend Health Check ──────────────────────────────────────
const checkBackend = async () => {
  try {
    const res = await fetch(`${BACKEND_HTTP}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      currentState.backendOnline = true;
      if (!currentState.isRecording) {
        setStatus('Ready to record', 'connected');
        btnRecord.disabled = false;
      }
      return true;
    }
  } catch {
    currentState.backendOnline = false;
    setStatus('Backend offline — start Docker', '');
    btnRecord.disabled = true;
  }
  return false;
};

// ── Meeting Detection ─────────────────────────────────────────
const checkMeeting = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const meetingDomains = ['meet.google.com', 'zoom.us', 'teams.microsoft.com'];
    const isMeetingTab = meetingDomains.some(d => tab.url?.includes(d));

    if (isMeetingTab) {
      currentState.meetingDetected = true;
      currentState.meetingTabId = tab.id;

      // Try to get status from content script
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_MEETING_STATUS' });
        if (response) {
          meetingInfo.classList.add('visible');
          meetingPlatform.textContent = response.platform || 'Meeting';
          meetingTitle.textContent = response.title || tab.title || 'Active meeting';
        }
      } catch {
        // Content script might not be ready yet
        meetingInfo.classList.add('visible');
        meetingPlatform.textContent = 'Meeting detected';
        meetingTitle.textContent = tab.title || 'Active meeting';
      }
    }
  } catch (err) {
    console.error('Meeting check error:', err);
  }
};

// ── Record Button ─────────────────────────────────────────────
btnRecord.addEventListener('click', async () => {
  try {
    btnRecord.disabled = true;
    btnRecord.textContent = 'Starting...';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const response = await chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      tabId: tab.id,
      meetingInfo: {
        platform: meetingPlatform.textContent,
        title: meetingTitle.textContent,
      },
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Failed to start recording');
    }
  } catch (err) {
    console.error('Start recording error:', err);
    setStatus(`Error: ${err.message}`, '');
    btnRecord.disabled = false;
    btnRecord.textContent = '⏺ Start Recording';
  }
});

// ── Stop Button ───────────────────────────────────────────────
btnStop.addEventListener('click', async () => {
  btnStop.disabled = true;
  btnStop.textContent = 'Stopping...';
  await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
});

// ── Sessions Button ───────────────────────────────────────────
btnSessions.addEventListener('click', () => {
  chrome.tabs.create({ url: `${BACKEND_HTTP}/api/sessions` });
});

// ── Export Button ─────────────────────────────────────────────
exportLink.addEventListener('click', (e) => {
  e.preventDefault();
  if (currentState.sessionId) {
    chrome.tabs.create({ url: `${BACKEND_HTTP}/api/transcripts/${currentState.sessionId}/export` });
  }
});

// ── Background Message Listener ───────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'RECORDING_STARTED':
      currentState.isRecording = true;
      setRecordingUI(true);
      break;

    case 'RECORDING_STOPPED':
      currentState.isRecording = false;
      setRecordingUI(false);
      showProcessing('Transcribing audio — this may take a moment...');
      break;

    case 'SESSION_STARTED':
      currentState.sessionId = message.sessionId;
      sessionIdDisplay.textContent = message.sessionId.slice(0, 8) + '...';
      break;

    case 'PROCESSING':
      showProcessing(message.message);
      break;

    case 'TRANSCRIPT_READY':
      hideProcessing();
      currentState.sessionId = message.sessionId;
      renderTranscript(message.utterances);
      exportLink.style.display = 'inline';
      exportLink.href = `${BACKEND_HTTP}/api/transcripts/${message.sessionId}/export`;
      setStatus(`Transcript ready — ${message.utterances?.length || 0} utterances`, 'connected');
      break;

    case 'BACKEND_ERROR':
    case 'ERROR':
      hideProcessing();
      setStatus(`Error: ${message.message}`, '');
      setRecordingUI(false);
      currentState.isRecording = false;
      break;

    case 'MEETING_DETECTED':
      meetingInfo.classList.add('visible');
      meetingPlatform.textContent = message.platform;
      meetingTitle.textContent = message.title;
      break;

    case 'MEETING_ENDED':
      meetingInfo.classList.remove('visible');
      break;

    case 'WS_CONNECTED':
      currentState.backendOnline = true;
      if (!currentState.isRecording) setStatus('Ready to record', 'connected');
      break;

    case 'WS_DISCONNECTED':
      currentState.backendOnline = false;
      if (!currentState.isRecording) setStatus('Backend disconnected', '');
      break;
  }
});

// ── Init ──────────────────────────────────────────────────────
const init = async () => {
  // Check backend health
  await checkBackend();

  // Check for active meeting tab
  await checkMeeting();

  // Get current state from background
  const bgState = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (bgState) {
    currentState.isRecording = bgState.isRecording;
    currentState.sessionId = bgState.sessionId;

    if (bgState.isRecording) {
      setRecordingUI(true);
    }

    if (bgState.meetingPlatform) {
      meetingInfo.classList.add('visible');
      meetingPlatform.textContent = bgState.meetingPlatform;
      meetingTitle.textContent = bgState.meetingTitle || 'Active meeting';
    }
  }

  // Load last transcript from storage if any
  const stored = await chrome.storage.local.get(['lastSessionId']);
  if (stored.lastSessionId) {
    const transcriptData = await chrome.storage.local.get([`transcript_${stored.lastSessionId}`]);
    const utterances = transcriptData[`transcript_${stored.lastSessionId}`];
    if (utterances?.length > 0) {
      currentState.sessionId = stored.lastSessionId;
      sessionIdDisplay.textContent = stored.lastSessionId.slice(0, 8) + '...';
      renderTranscript(utterances);
      exportLink.style.display = 'inline';
    }
  }

  // Poll backend health every 5 seconds
  setInterval(checkBackend, 5000);
};

init();