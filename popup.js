// popup.js
function getDeviceIcon(deviceName) {
  const deviceTypes = {
    'iPhone': '📱',
    'iPad': '📱',
    'Android': '📱',
    'Desktop': '💻',
    'Laptop': '💻',
    'Chromebook': '💻',
    'default': '💻'
  };

  const type = Object.keys(deviceTypes).find(type => 
    deviceName.toLowerCase().includes(type.toLowerCase())
  ) || 'default';

  return deviceTypes[type];
}

function getFaviconOrDefault(url, title) {
  if (!url || !isValidUrl(url)) return getDefaultIcon(title);
  
  // Use Chrome's native favicon API for better reliability
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

function getDefaultIcon(title = '') {
  const letter = (title || '').charAt(0).toUpperCase() || 'T';
  const colors = ['#4285f4', '#ea4335', '#34a853', '#fbbc04'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
      <rect width="32" height="32" fill="#f1f3f4" rx="6"/>
      <text x="16" y="22" font-size="16" font-family="Arial" fill="${color}" text-anchor="middle">${letter}</text>
    </svg>
  `)}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  }).format(date);
}

// Add cleanup function for tab event listeners
function cleanupTabListeners(tabEl) {
  const oldListener = tabEl.getAttribute('click-listener');
  if (oldListener) {
    tabEl.removeEventListener('click', window[oldListener]);
    delete window[oldListener];
  }
}

// Adjust timezone for history search
function getSearchTimeRange(syncTime) {
  const end = new Date(syncTime);
  end.setHours(23, 59, 59, 999);
  
  const start = new Date(syncTime);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 1);
  
  return { startTime: start.getTime(), endTime: end.getTime() };
}

document.addEventListener('DOMContentLoaded', () => {
  const content = document.getElementById('content');
  
  try {
    chrome.tabs.create({ url: 'history.html' }, (tab) => {
      if (chrome.runtime.lastError) {
        content.className = 'error';
        content.textContent = `Error: ${chrome.runtime.lastError.message}`;
      } else {
        window.close();
      }
    });
  } catch (error) {
    content.className = 'error';
    content.textContent = `Error: ${error.message}`;
  }
});

function getVisitType(transition) {
  const types = {
    'link': 'Clicked a link',
    'typed': 'Directly accessed',
    'auto_bookmark': 'Opened from bookmark',
    'reload': 'Page reloaded',
    'generated': 'System generated',
    'auto_toplevel': 'Auto-suggested',
    'form_submit': 'Form submitted',
    'keyword': 'Search result',
    'keyword_generated': 'Search generated'
  };
  return types[transition] || transition;
}