// Content script — injected into Google Meet / Zoom / Teams tabs
// Detects meeting activity and notifies the background service worker

(function () {
  'use strict';

  const MEETING_PATTERNS = {
    'meet.google.com': {
      name: 'Google Meet',
      activeSelector: '[data-call-id], [data-meeting-title], .crqnQb',
    },
    'zoom.us': {
      name: 'Zoom',
      activeSelector: '#wc-container-right, .meeting-client',
    },
    'teams.microsoft.com': {
      name: 'Microsoft Teams',
      activeSelector: '.calling-unified-bar, [data-tid="calling-screen"]',
    },
  };

  const hostname = window.location.hostname;
  const platform = Object.keys(MEETING_PATTERNS).find((p) => hostname.includes(p));

  if (!platform) return;

  const { name, activeSelector } = MEETING_PATTERNS[platform];
  let meetingDetected = false;
  let checkInterval = null;

  const notifyBackground = (type, payload = {}) => {
    chrome.runtime.sendMessage({ type, platform: name, url: window.location.href, ...payload });
  };

  const checkMeetingActive = () => {
    const el = document.querySelector(activeSelector);
    const isActive = !!el;

    if (isActive && !meetingDetected) {
      meetingDetected = true;
      notifyBackground('MEETING_DETECTED', { title: document.title });
      console.log(`[MeetingTranscriber] ${name} meeting detected`);
    } else if (!isActive && meetingDetected) {
      meetingDetected = false;
      notifyBackground('MEETING_ENDED');
      console.log(`[MeetingTranscriber] ${name} meeting ended`);
    }
  };

  // Poll every 2 seconds for meeting state changes
  checkInterval = setInterval(checkMeetingActive, 2000);
  checkMeetingActive(); // immediate check

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_MEETING_STATUS') {
      sendResponse({
        active: meetingDetected,
        platform: name,
        title: document.title,
        url: window.location.href,
      });
    }
    return true;
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (checkInterval) clearInterval(checkInterval);
    if (meetingDetected) notifyBackground('MEETING_ENDED');
  });
})();