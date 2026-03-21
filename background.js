// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openHistory') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('history.html') + 
           `?deviceName=${encodeURIComponent(request.deviceName)}` +
           `&tabUrl=${encodeURIComponent(request.tabUrl)}` +
           `&syncTime=${request.syncTime}`
    });
  }
});

// Listen for Chrome's native dark mode changes
chrome.runtime.onInstalled.addListener(() => {
  // Service workers can't access window.matchMedia
  // Let the content scripts handle theme detection
  // Set a default theme that will be overridden by theme.js
  chrome.storage.sync.set({ darkMode: true });
}); 