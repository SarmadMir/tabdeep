// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const deviceName = urlParams.get('deviceName');
const tabUrl = urlParams.get('tabUrl');
const syncTime = parseInt(urlParams.get('syncTime'));

/**
 * Simple HTML sanitization to prevent XSS attacks
 * Escapes dangerous characters in user-controlled content
 */
function sanitizeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize URL for safe display - keeps basic URL structure readable
 */
function sanitizeUrl(url) {
  if (!url) return '';
  try {
    // First validate it's a real URL
    const urlObj = new URL(url);
    // Return sanitized version for display
    return sanitizeHtml(url);
  } catch (e) {
    // If invalid URL, sanitize the string
    return sanitizeHtml(url);
  }
}

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

  return `<div class="device-icon">${deviceTypes[type]}</div>`;
}

function getDaysAgo(date) {
  const now = new Date();
  // Set both dates to midnight for accurate day comparison
  const dateAtMidnight = new Date(date);
  dateAtMidnight.setHours(0, 0, 0, 0);
  const nowAtMidnight = new Date(now);
  nowAtMidnight.setHours(0, 0, 0, 0);
  
  const diffTime = nowAtMidnight - dateAtMidnight;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function formatTimeAgo(date) {
  const days = getDaysAgo(date);
  
  if (days === 0) {
    return 'Today';
  } else if (days === 1) {
    return 'Yesterday';
  } else {
    return `${days} days ago`;
  }
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

function getVisitType(transition) {
  const types = {
    'link': 'Clicked a link',
    'typed': 'Typed in address',
    'auto_bookmark': 'Opened from bookmarks',
    'reload': 'Page reloaded',
    'generated': 'System generated',
    'auto_toplevel': 'Auto-suggested',
    'form_submit': 'Form submitted',
    'keyword': 'Search result',
    'keyword_generated': 'Search generated'
  };
  return types[transition] || transition;
}

async function getFaviconUrl(url) {
  try {
    // Validate URL first
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL');
    }
    
    // Try to construct a valid URL object to check if it's malformed
    new URL(url);
    
    // Use chrome-extension favicon API directly (no fetch needed)
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=24`;
  } catch (error) {
    // If URL is malformed, return a default favicon
    try {
      const domain = new URL(url).hostname;
      const letter = domain.charAt(0).toUpperCase();
      return `data:image/svg+xml,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
          <rect width="24" height="24" fill="#f1f3f4" rx="4"/>
          <text x="12" y="17" font-size="14" font-family="Arial" fill="#5f6368" text-anchor="middle">${letter}</text>
        </svg>
      `)}`;
    } catch {
      // Final fallback if everything fails
      return `data:image/svg+xml,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
          <rect width="24" height="24" fill="#f1f3f4" rx="4"/>
          <text x="12" y="17" font-size="14" font-family="Arial" fill="#5f6368" text-anchor="middle">?</text>
        </svg>
      `)}`;
    }
  }
}

async function getTabHistory(tab, syncTime) {
  try {
    const results = await new Promise((resolve, reject) => {
      // Look for history in a wider time window (3 days before sync time)
      chrome.history.search({
        text: tab.url,
        startTime: syncTime - (3 * 24 * 60 * 60 * 1000), // 3 days before
        endTime: syncTime + (60 * 1000), // 1 minute after to account for sync delay
        maxResults: 1000
      }, (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(results);
        }
      });
    });

    if (results.length === 0) {
      return { visits: [] };
    }

    const visits = await new Promise((resolve, reject) => {
      chrome.history.getVisits({ url: results[0].url }, (visits) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(visits);
        }
      });
    });

    return {
      visits: visits
        .filter(visit => {
          const visitTime = visit.visitTime;
          return visitTime <= syncTime && visitTime >= (syncTime - (3 * 24 * 60 * 60 * 1000));
        })
        .sort((a, b) => b.visitTime - a.visitTime)
    };
  } catch (error) {
    // Log error in development only
    if (chrome.runtime.getManifest().version.includes('dev')) {
    console.error('Error fetching history:', error);
    }
    return { visits: [] };
  }
}

// Store event listeners for cleanup
const eventListeners = new WeakMap();

function cleanupEventListeners() {
  // Remove existing event listeners before setting up new ones
  document.querySelectorAll('.device-section, .tab-section').forEach(section => {
    const listeners = eventListeners.get(section);
    if (listeners) {
      listeners.forEach(({ element, event, handler }) => {
        element.removeEventListener(event, handler);
      });
      eventListeners.delete(section);
    }
  });
}

function setupCollapsible() {
  // Clean up existing listeners first
  cleanupEventListeners();
  
  // Device sections (including current device)
  document.querySelectorAll('.device-section').forEach(section => {
    const header = section.querySelector('.device-header');
    const content = section.querySelector('.device-content');
    const chevron = header.querySelector('.chevron');
    
    if (!header || !content || !chevron) return;
    
    // Set initial state
    chevron.style.transform = 'rotate(0deg)';
    content.style.height = '0';
    content.style.opacity = '0';

    const clickHandler = (e) => {
      // Don't expand/collapse if clicking on action buttons
      if (e.target.closest('.action-btn')) return;
      
      if (!section.classList.contains('expanded')) {
        section.classList.add('expanded');
        chevron.style.transform = 'rotate(180deg)';
        const height = content.scrollHeight;
        content.style.height = height + 'px';
        content.style.opacity = '1';
      } else {
        content.style.height = content.scrollHeight + 'px';
        content.offsetHeight; // Force reflow
        content.style.height = '0';
        content.style.opacity = '0';
        section.classList.remove('expanded');
        chevron.style.transform = 'rotate(0deg)';
      }
    };
    
    header.addEventListener('click', clickHandler);
    
    // Store listener for cleanup
    eventListeners.set(section, [{ element: header, event: 'click', handler: clickHandler }]);
  });

  // All tab sections (both current device and other devices)
  document.querySelectorAll('.tab-section').forEach(section => {
    const header = section.querySelector('.tab-header');
    const content = section.querySelector('.tab-content');
    const chevron = header.querySelector('.chevron');
    
    if (!header || !content || !chevron) return;
    
    // Set initial state
    chevron.style.transform = 'rotate(0deg)';
    content.style.height = '0';
    content.style.opacity = '0';

    const clickHandler = (e) => {
      // Don't expand/collapse if clicking on action buttons
      if (e.target.closest('.action-btn')) return;
      if (e.target.tagName === 'A') return;
      
      if (!section.classList.contains('expanded')) {
        section.classList.add('expanded');
        chevron.style.transform = 'rotate(180deg)';
        const height = content.scrollHeight;
        content.style.height = height + 'px';
        content.style.opacity = '1';
      } else {
        content.style.height = content.scrollHeight + 'px';
        content.offsetHeight; // Force reflow
        content.style.height = '0';
        content.style.opacity = '0';
        section.classList.remove('expanded');
        chevron.style.transform = 'rotate(0deg)';
      }
    };
    
    header.addEventListener('click', clickHandler);
    
    // Store listener for cleanup (append to existing listeners if any)
    const existingListeners = eventListeners.get(section) || [];
    existingListeners.push({ element: header, event: 'click', handler: clickHandler });
    eventListeners.set(section, existingListeners);
  });

  // Add transition end listeners to clean up inline heights
  document.querySelectorAll('.device-content, .tab-content').forEach(content => {
    content.addEventListener('transitionend', (e) => {
      if (e.propertyName === 'height') {
        const section = content.closest('.device-section, .tab-section');
        if (section.classList.contains('expanded')) {
          content.style.height = 'auto';
        } else {
          content.style.removeProperty('height');
        }
      }
    });
  });
}

/**
 * Setup click handlers for visit and delete actions using event delegation
 */
function setupHistoryActions() {
  // Remove existing delegated listeners
  document.removeEventListener('click', handleHistoryActions);
  
  // Add single delegated event listener
  document.addEventListener('click', handleHistoryActions);
}

/**
 * Handle all history action clicks using event delegation
 */
async function handleHistoryActions(e) {
  // Visit button handler
  if (e.target.closest('.visit-btn')) {
    e.stopPropagation();
    e.preventDefault();
    
    const url = e.target.closest('[data-url]')?.dataset.url;
    if (url) {
      chrome.tabs.create({ url: url });
    }
    return;
  }

  // Delete button handler
  if (e.target.closest('.delete-btn')) {
    e.stopPropagation();
    e.preventDefault();
    
    const historyItem = e.target.closest('[data-url]');
    const url = historyItem?.dataset.url;
    
    if (url && historyItem) {
      try {
        // Delete from Chrome history immediately (no confirmation)
        await new Promise((resolve, reject) => {
          chrome.history.deleteUrl({ url: url }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
        
        // Remove from UI with animation
        historyItem.style.opacity = '0';
        historyItem.style.transform = 'translateX(-20px)';
        historyItem.style.transition = 'all 0.3s ease';
        
        setTimeout(() => {
          historyItem.remove();
        }, 300);
        
        // Show success feedback
        showNotification('Page removed from history', 'success');
      } catch (error) {
        // Log error in development only
        if (chrome.runtime.getManifest().version.includes('dev')) {
          console.error('Error deleting history item:', error);
        }
        showNotification('Failed to remove page from history', 'error');
      }
    }
    return;
  }
}

/**
 * Show notification to user
 */
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  // Style the notification
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '12px 20px',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '500',
    zIndex: '10000',
    opacity: '0',
    transform: 'translateY(-10px)',
    transition: 'all 0.3s ease',
    backgroundColor: type === 'success' ? '#34a853' : type === 'error' ? '#ea4335' : '#1a73e8'
  });
  
  // Add to page
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0)';
  }, 100);
  
  // Remove after delay
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

function countUniqueTabs(tabs) {
  // Use Set to count unique URLs
  const uniqueUrls = new Set(tabs.map(tab => tab.url));
  return uniqueUrls.size;
}

function formatUrl(url) {
  try {
    const urlObj = new URL(url);
    // For special cases like chrome-extension:// urls
    if (urlObj.protocol === 'chrome-extension:') {
      return url.split('?')[0]; // Remove query parameters
    }
    // Remove common tracking parameters
    const cleanPath = urlObj.pathname.replace(/\/(index\.html?)?$/, '');
    return `${urlObj.hostname}${cleanPath}`;
  } catch (e) {
    // If URL parsing fails, return the original but truncated
    return url.split('?')[0];
  }
}

let devicesData = []; // Store the original devices data

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const searchInput = document.getElementById('searchInput');
  
  navItems.forEach(item => {
    item.addEventListener('click', async () => {
      // Update active state
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      // Show corresponding view
      const viewId = item.dataset.view + 'View';
      document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
      });
      document.getElementById(viewId).classList.add('active');

      // Clear search when switching between views
      if (searchInput) {
        const hadSearch = searchInput.value.trim().length > 0;
        searchInput.value = ''; // Always clear the search input
        
        // Reset BOTH views to full content if there was a search active
        if (hadSearch) {
          // Reset current device history
          await renderCurrentDeviceHistory();
          // Reset other devices
          if (devicesData && devicesData.length > 0) {
            renderDevices(devicesData);
          }
        }
      }
    });
  });
}

async function filterContent(searchTerm, activeView) {
  const normalizedSearch = searchTerm.toLowerCase().trim();
  
  if (activeView === 'historyView') {
    await filterHistory(normalizedSearch);
  } else {
    filterDevices(normalizedSearch);
  }
}

async function filterHistory(searchTerm) {
  const historyView = document.getElementById('historyView');
  
  if (!searchTerm) {
    // If no search term, reload all history
    await renderCurrentDeviceHistory();
    return;
  }

  // Get fresh data for filtering
  const currentTabs = await getCurrentTabs();
  const groupedHistory = await getCurrentDeviceHistory(true);

  // Filter current tabs
  const filteredTabs = currentTabs.filter(tab => {
    const titleMatch = tab.title?.toLowerCase().includes(searchTerm);
    const urlMatch = tab.url?.toLowerCase().includes(searchTerm);
    return titleMatch || urlMatch;
  });

  // Filter history items
  const filteredHistory = groupedHistory.map(group => {
    const filteredItems = group.items.filter(item => {
      const titleMatch = item.title?.toLowerCase().includes(searchTerm);
      const urlMatch = item.url?.toLowerCase().includes(searchTerm);
      return titleMatch || urlMatch;
    });
    
    return {
      ...group,
      items: filteredItems
    };
  }).filter(group => group.items.length > 0);

  // Render filtered results
  await renderFilteredCurrentDeviceHistory(filteredTabs, filteredHistory, searchTerm);
}

/**
 * Render filtered current device history results
 */
async function renderFilteredCurrentDeviceHistory(filteredTabs, filteredHistory, searchTerm) {
  const historyView = document.getElementById('historyView');

  // Check if we have any results
  if (filteredTabs.length === 0 && filteredHistory.length === 0) {
    historyView.innerHTML = `
      <div class="no-results">
        No matches found for "${sanitizeHtml(searchTerm)}"
      </div>
    `;
    return;
  }

  let html = `
    <div class="device-section current-device">
      <div class="device-header">
        <div class="device-info">
          <div class="device-title">
            <div class="device-icon">💻</div>
            Current Device
            <span class="tab-count">${filteredTabs.length} result${filteredTabs.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="device-sync">
          Search Results
        </div>
        <div class="chevron">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
      </div>
      <div class="device-content" style="height: 0; opacity: 0;">
  `;

  // Render filtered current tabs if any
  if (filteredTabs.length > 0) {
    html += `
        <div class="current-tabs-section">
          <div class="section-header">Matching Open Tabs (${filteredTabs.length})</div>
          <div class="tabs-list">
    `;

    for (const tab of filteredTabs) {
      try {
        const { visits } = await getTabHistory(tab, Date.now());
        const faviconUrl = tab.favIconUrl || await getFaviconUrl(tab.url);

        html += `
          <div class="tab-section" data-url="${sanitizeHtml(tab.url)}">
            <div class="tab-header">
              <div class="tab-icon">
                <img class="tab-favicon" src="${faviconUrl}">>
              </div>
              <div class="tab-info">
                <div class="tab-title">${sanitizeHtml(tab.title) || 'Untitled'}</div>
                <div class="tab-url" title="${sanitizeHtml(tab.url)}">${sanitizeHtml(formatUrl(tab.url))}</div>
              </div>
              <div class="tab-actions">
                <button class="action-btn visit-btn" title="Visit page">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15,3 21,3 21,9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </button>
              </div>
              <div class="chevron">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </div>
            </div>
            <div class="tab-content" style="height: 0; opacity: 0;">
              ${visits.length > 0 ? `
                <div class="visit-history">
                  <div class="visit-header">Visit History (${visits.length} ${visits.length === 1 ? 'visit' : 'visits'})</div>
                  ${visits.map(visit => {
                    const visitTime = new Date(visit.visitTime);
                    const timeString = visitTime.toLocaleTimeString('en-US', { 
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    });
                    const dateString = visitTime.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    });
                    
                    return `
                      <div class="visit-item">
                        <div class="visit-time">
                          <span class="visit-date">${dateString}</span>
                          <span class="visit-time-sep">·</span>
                          <span class="visit-time-val">${timeString}</span>
                        </div>
                        <div class="visit-action">
                          <span class="visit-icon">
                            ${visit.transition === 'link' ? 
                              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>' :
                              visit.transition === 'typed' ?
                              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>' :
                              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>'
                            }
                          </span>
                          ${getVisitType(visit.transition)}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              ` : `
                <div class="no-history">
                  <div class="info-icon">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M12 16v-4"></path>
                      <path d="M12 8h.01"></path>
                    </svg>
                  </div>
                  No recent visit history for this tab
                </div>
              `}
            </div>
          </div>
        `;
      } catch (tabError) {
        // Log error in development only
        if (chrome.runtime.getManifest().version.includes('dev')) {
          console.warn('Error processing current tab:', tabError);
        }
        // Continue with next tab instead of breaking the entire section
      }
    }

    html += `
          </div>
        </div>
    `;
  }

  html += `
      </div>
    </div>
  `;

  // Add filtered date-grouped history sections
  for (const group of filteredHistory) {
    html += `
      <div class="history-date-section" data-date="${group.date}">
        <div class="date-header">${formatDateHeader(group.date)} (${group.items.length} result${group.items.length !== 1 ? 's' : ''})</div>
        <div class="history-items">
    `;
    
    for (const item of group.items) {
      try {
        const faviconUrl = await getFaviconUrl(item.url);
        const visitTime = new Date(item.lastVisitTime);
        const timeString = visitTime.toLocaleTimeString('en-US', { 
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        
        html += `
          <div class="history-item" data-url="${sanitizeHtml(item.url)}">
            <div class="history-time">${timeString}</div>
            <div class="history-content">
              <div class="tab-icon">
                <img class="tab-favicon" src="${faviconUrl}">> 
                     >
              </div>
              <div class="history-info">
                <div class="history-title">${sanitizeHtml(item.title) || 'Untitled'}</div>
                <div class="history-url">${sanitizeHtml(formatUrl(item.url))}</div>
              </div>
            </div>
            <div class="history-actions">
              <button class="action-btn visit-btn" title="Visit page">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15,3 21,3 21,9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </button>
              <button class="action-btn delete delete-btn" title="Remove from history">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3,6 5,6 21,6"/>
                  <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"/>
                </svg>
              </button>
            </div>
          </div>
        `;
      } catch (itemError) {
        // Log error in development only
        if (chrome.runtime.getManifest().version.includes('dev')) {
          console.warn('Error processing history item:', itemError);
        }
        // Continue with next item instead of breaking the entire group
      }
    }
    
    html += `
        </div>
      </div>
    `;
  }
  
  historyView.innerHTML = html;
  setupCollapsible();
  setupHistoryActions();
  setupInfiniteScroll();
}

function filterDevices(searchTerm) {
  const devicesView = document.getElementById('devicesView');
  
  if (!searchTerm) {
    renderDevices(devicesData);
    return;
  }

  const filteredDevices = devicesData.map(device => {
    const filteredDevice = JSON.parse(JSON.stringify(device));
    
    filteredDevice.sessions = device.sessions.map(session => {
      const filteredSession = {...session};
      if (session.window?.tabs) {
        filteredSession.window = {
          ...session.window,
          tabs: session.window.tabs.filter(tab => {
            const titleMatch = tab.title?.toLowerCase().includes(searchTerm);
            const urlMatch = tab.url?.toLowerCase().includes(searchTerm);
            return titleMatch || urlMatch;
          })
        };
      }
      return filteredSession;
    }).filter(session => session.window?.tabs?.length > 0);
    
    return filteredDevice;
  }).filter(device => device.sessions.length > 0);

  if (filteredDevices.length === 0) {
    devicesView.innerHTML = `
      <div class="no-results">
        No matches found for "${searchTerm}"
      </div>
    `;
    return;
  }

  renderDevices(filteredDevices);
}

function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  let debounceTimeout;

  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      const activeView = document.querySelector('.view.active').id;
      await filterContent(e.target.value, activeView);
    }, 300);
  });

  // Add keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + F for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
    }
    
    // Ctrl/Cmd + R for refresh (prevent page reload, refresh data instead)
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      refreshAllData();
    }
  });
}

async function renderDevices(devices) {
  const devicesView = document.getElementById('devicesView');
  let html = '';
  
  for (const device of devices) {
    try {
      const lastModified = new Date(device.sessions[0].lastModified * 1000);
      const allTabs = device.sessions.reduce((tabs, session) => 
        tabs.concat(session.window?.tabs || []), []);
      const tabCount = allTabs.length;
      
      html += `
        <div class="device-section">
          <div class="device-header">
            <div class="device-info">
              <div class="device-title">
                ${getDeviceIcon(sanitizeHtml(device.deviceName))} ${sanitizeHtml(device.deviceName)}
                <span class="tab-count">${tabCount} tab${tabCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div class="device-sync">
              Last synced: ${formatDate(lastModified)} (${formatTimeAgo(lastModified)})
            </div>
            <div class="chevron">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
          </div>
          <div class="device-content">
      `;

      for (const session of device.sessions) {
        if (session.window && session.window.tabs) {
          for (const tab of session.window.tabs) {
            try {
              const { visits } = await getTabHistory(tab, session.lastModified * 1000);
              const faviconUrl = await getFaviconUrl(tab.url);
              
              html += `
                <div class="tab-section" data-url="${sanitizeHtml(tab.url)}">
                  <div class="tab-header">
                    <div class="tab-icon">
                      <img class="tab-favicon" src="${faviconUrl}">>
                    </div>
                    <div class="tab-info">
                      <div class="tab-title">${sanitizeHtml(tab.title) || 'Untitled'}</div>
                      <div class="tab-url" title="${sanitizeHtml(tab.url)}">${sanitizeHtml(formatUrl(tab.url))}</div>
                    </div>
                    <div class="tab-actions">
                      <button class="action-btn visit-btn" title="Visit page">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15,3 21,3 21,9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </button>
                    </div>
                    <div class="chevron">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </div>
                  </div>
                  <div class="tab-content">
              `;

              if (visits.length > 0) {
                html += `
                  <div class="visit-history">
                    <div class="visit-header">Visit History (${visits.length} ${visits.length === 1 ? 'visit' : 'visits'})</div>
                    ${visits.map(visit => {
                      const visitTime = new Date(visit.visitTime);
                      const timeString = visitTime.toLocaleTimeString('en-US', { 
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      });
                      const dateString = visitTime.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                      });
                      
                      return `
                        <div class="visit-item">
                          <div class="visit-time">
                            <span class="visit-date">${dateString}</span>
                            <span class="visit-time-sep">·</span>
                            <span class="visit-time-val">${timeString}</span>
                          </div>
                          <div class="visit-action">
                            <span class="visit-icon">
                              ${visit.transition === 'link' ? 
                                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>' :
                                visit.transition === 'typed' ?
                                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>' :
                                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>'
                              }
                            </span>
                            ${getVisitType(visit.transition)}
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `;
              } else {
                html += `
                  <div class="no-history">
                    <div class="info-icon">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 16v-4"></path>
                        <path d="M12 8h.01"></path>
                      </svg>
                    </div>
                    This tab was open on the device but no browsing activity was recorded in the last 3 days
                  </div>
                `;
              }

              html += '</div></div>'; // Close tab-content and tab-section
            } catch (tabError) {
              // Log error in development only
              if (chrome.runtime.getManifest().version.includes('dev')) {
              console.warn('Error processing tab:', tabError);
              }
              // Continue with next tab instead of breaking the entire device
            }
          }
        }
      }
      
      html += '</div></div>'; // Close device-content and device-section
    } catch (deviceError) {
      // Log error in development only
      if (chrome.runtime.getManifest().version.includes('dev')) {
      console.warn('Error processing device:', deviceError);
      }
      // Continue with next device instead of breaking the entire rendering
    }
  }
  
  devicesView.innerHTML = html;
  setupCollapsible();
  setupHistoryActions();
  setupInfiniteScroll();
}

function formatDateHeader(date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }
}

function groupHistoryByDate(historyItems) {
  const groups = {};
  
  historyItems.forEach(item => {
    const date = new Date(item.lastVisitTime);
    const dateString = date.toDateString();
    
    if (!groups[dateString]) {
      groups[dateString] = {
        date: date,
        items: []
      };
    }
    
    groups[dateString].items.push(item);
  });
  
  return Object.values(groups).sort((a, b) => b.date - a.date);
}

// Global variables for pagination
let historyPagination = {
  currentEndTime: Date.now(),
  itemsPerPage: 1000,
  allLoaded: false,
  isLoading: false
};

async function getCurrentDeviceHistory(isInitialLoad = true) {
  try {
    // For initial load, get last 3 days of history
    const searchStartTime = Date.now() - (3 * 24 * 60 * 60 * 1000); // 3 days ago
    
    const historyItems = await new Promise((resolve, reject) => {
      chrome.history.search({
        text: '',
        startTime: searchStartTime,
        endTime: isInitialLoad ? Date.now() : historyPagination.currentEndTime,
        maxResults: 1000
      }, (items) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(items);
        }
      });
    });



    // Only update pagination for non-initial loads
    if (!isInitialLoad) {
      if (historyItems.length === 0) {
        historyPagination.allLoaded = true;
      } else {
        // Set next end time to the oldest item's time
        const timestamps = historyItems.map(item => item.lastVisitTime).filter(t => t && t > 0);
        if (timestamps.length > 0) {
          historyPagination.currentEndTime = Math.min(...timestamps);
        }
      }
    } else {
      // For initial load, set the end time for next pagination but NEVER set allLoaded = true
      if (historyItems.length > 0) {
        const timestamps = historyItems.map(item => item.lastVisitTime).filter(t => t && t > 0);
        if (timestamps.length > 0) {
          historyPagination.currentEndTime = Math.min(...timestamps);
        }
      }
      // Explicitly ensure allLoaded stays false for initial loads
      historyPagination.allLoaded = false;
      
      // Mark time of initial load to prevent immediate pagination
      lastInitialLoad = Date.now();
    }

    // Track loaded items for initial load to prevent duplicates in pagination
    if (isInitialLoad) {
      historyItems.forEach(item => {
        const itemKey = `${item.url}_${item.lastVisitTime}`;
        loadedItemUrls.add(itemKey);
      });
    }
    
    const groupedHistory = groupHistoryByDate(historyItems);
    
    // Track dates for initial load to prevent duplicate sections
    if (isInitialLoad) {
      groupedHistory.forEach(group => {
        loadedDates.add(group.date);
      });
    }
    
    return groupedHistory;
  } catch (error) {
    // Log error in development only
    if (chrome.runtime.getManifest().version.includes('dev')) {
      console.error('Error fetching history:', error);
    }
    return [];
  }
}

async function loadMoreHistory() {
  // Only check allLoaded here - isLoading is managed by caller (loadMoreHistoryData)
  if (historyPagination.allLoaded) {
    return [];
  }

  try {
    // Load next batch starting from where we left off  
    // Use a smaller time window for pagination - 7 days instead of 30
    const timeWindow = 7 * 24 * 60 * 60 * 1000; // 7 days
    const startTime = Math.max(
      historyPagination.currentEndTime - timeWindow,
      Date.now() - (365 * 24 * 60 * 60 * 1000) // Don't go back more than 1 year
    );
    
    const historyItems = await new Promise((resolve, reject) => {
      chrome.history.search({
        text: '',
        startTime: startTime,
        endTime: historyPagination.currentEndTime,
        maxResults: historyPagination.itemsPerPage
      }, (items) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(items);
        }
      });
    });

    // Update pagination state
    if (historyItems.length === 0) {
      historyPagination.allLoaded = true;
    } else {
      const timestamps = historyItems.map(item => item.lastVisitTime).filter(t => t && t > 0);
      if (timestamps.length > 0) {
        const newEndTime = Math.min(...timestamps);
        historyPagination.currentEndTime = newEndTime;
      }
    }
    
    // Filter out items we've already loaded to prevent duplicates
    const newItems = historyItems.filter(item => {
      const itemKey = `${item.url}_${item.lastVisitTime}`;
      if (loadedItemUrls.has(itemKey)) {
        return false; // Skip duplicate
      }
      loadedItemUrls.add(itemKey); // Track this item
      return true;
    });
    
    return groupHistoryByDate(newItems);
  } catch (error) {
    console.error('Error in loadMoreHistory():', error);
    throw error; // Re-throw so loadMoreHistoryData can handle it
  }
}

async function getCurrentTabs() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(tabs);
      }
    });
  });
}

async function renderCurrentDeviceHistory() {
  const historyView = document.getElementById('historyView');
  const currentTabs = await getCurrentTabs();
  const groupedHistory = await getCurrentDeviceHistory(true);
  
  let html = `
    <div class="device-section current-device">
      <div class="device-header">
        <div class="device-info">
          <div class="device-title">
            <div class="device-icon">💻</div>
            Current Device
            <span class="tab-count">${currentTabs.length} tab${currentTabs.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="device-sync">
          Currently Active
        </div>
        <div class="chevron">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
      </div>
      <div class="device-content" style="height: 0; opacity: 0;">
        <div class="current-tabs-section">
          <div class="section-header">Currently Open Tabs</div>
          <div class="tabs-list">
  `;

  for (const tab of currentTabs) {
    try {
      const { visits } = await getTabHistory(tab, Date.now());
      const faviconUrl = tab.favIconUrl || await getFaviconUrl(tab.url);

      html += `
        <div class="tab-section" data-url="${sanitizeHtml(tab.url)}">
          <div class="tab-header">
            <div class="tab-icon">
              <img class="tab-favicon" src="${faviconUrl}">
            </div>
            <div class="tab-info">
              <div class="tab-title">${sanitizeHtml(tab.title) || 'Untitled'}</div>
              <div class="tab-url" title="${sanitizeHtml(tab.url)}">${sanitizeHtml(formatUrl(tab.url))}</div>
            </div>
            <div class="tab-actions">
              <button class="action-btn visit-btn" title="Visit page">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15,3 21,3 21,9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </button>
            </div>
            <div class="chevron">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
          </div>
          <div class="tab-content" style="height: 0; opacity: 0;">
      `;

      if (visits.length > 0) {
        html += `
          <div class="visit-history">
            <div class="visit-header">Visit History (${visits.length} ${visits.length === 1 ? 'visit' : 'visits'})</div>
            ${visits.map(visit => {
              const visitTime = new Date(visit.visitTime);
              const timeString = visitTime.toLocaleTimeString('en-US', { 
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              });
              const dateString = visitTime.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
              });
              
              return `
                <div class="visit-item">
                  <div class="visit-time">
                    <span class="visit-date">${dateString}</span>
                    <span class="visit-time-sep">·</span>
                    <span class="visit-time-val">${timeString}</span>
                  </div>
                  <div class="visit-action">
                    <span class="visit-icon">
                      ${visit.transition === 'link' ? 
                        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>' :
                        visit.transition === 'typed' ?
                        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>' :
                        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>'
                      }
                    </span>
                    ${getVisitType(visit.transition)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      } else {
        html += `
          <div class="no-history">
            <div class="info-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4"></path>
                <path d="M12 8h.01"></path>
              </svg>
            </div>
            No browsing history recorded for this tab in the last 3 days
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;
    } catch (tabError) {
      console.warn('Error processing current tab:', tabError);
      // Continue with next tab instead of breaking the entire rendering
    }
  }

  html += `
          </div>
        </div>
      </div>
    </div>
  `;

  // Add date-grouped history sections
  for (const group of groupedHistory) {
    html += `
      <div class="history-date-section" data-date="${group.date}">
        <div class="date-header">${formatDateHeader(group.date)}</div>
        <div class="history-items">
    `;
    
    for (const item of group.items) {
      try {
        const faviconUrl = await getFaviconUrl(item.url);
        const visitTime = new Date(item.lastVisitTime);
        const timeString = visitTime.toLocaleTimeString('en-US', { 
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        
        html += `
          <div class="history-item" data-url="${sanitizeHtml(item.url)}">
            <div class="history-time">${timeString}</div>
            <div class="history-content">
              <div class="tab-icon">
                <img class="tab-favicon" src="${faviconUrl}">> 
                     >
              </div>
              <div class="history-info">
                <div class="history-title">${sanitizeHtml(item.title) || 'Untitled'}</div>
                <div class="history-url">${sanitizeHtml(formatUrl(item.url))}</div>
              </div>
            </div>
            <div class="history-actions">
              <button class="action-btn visit-btn" title="Visit page">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15,3 21,3 21,9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </button>
              <button class="action-btn delete delete-btn" title="Remove from history">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3,6 5,6 21,6"/>
                  <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"/>
                </svg>
              </button>
            </div>
          </div>
        `;
      } catch (itemError) {
        // Log error in development only
        if (chrome.runtime.getManifest().version.includes('dev')) {
        console.warn('Error processing history item:', itemError);
        }
        // Continue with next item instead of breaking the entire group
      }
    }
    
    html += `
        </div>
      </div>
    `;
  }
  
  historyView.innerHTML = html;
  setupCollapsible();
  setupHistoryActions();
  setupInfiniteScroll();
}

async function loadAllHistory(isRefresh = false) {
  const historyView = document.getElementById('historyView');
  const devicesView = document.getElementById('devicesView');
  
  try {
    // Only show loading states on initial load, not refresh
    if (!isRefresh) {
    historyView.innerHTML = '<div class="loading">Loading history...</div>';
      devicesView.innerHTML = '<div class="loading">Loading devices...</div>';
    }

    // Load current device history
    await renderCurrentDeviceHistory();

    // Load other devices
    const devices = await new Promise((resolve, reject) => {
      chrome.sessions.getDevices((devices) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(devices);
        }
      });
    });
    
    if (!devices || devices.length === 0) {
      devicesView.innerHTML = `
        <div class="no-history">
          No synced devices found. Make sure you're signed into Chrome and sync is enabled.
        </div>
      `;
      return;
    }

    devicesData = devices; // Store the original data
    renderDevices(devices);
    
  } catch (error) {
    const errorMessage = `
      <div class="no-history">
        Failed to load history: ${error.message}
      </div>
    `;
    historyView.innerHTML = errorMessage;
    devicesView.innerHTML = errorMessage;
  }
}

/**
 * Refresh all history data
 */
async function refreshAllData() {
  const refreshBtn = document.getElementById('refreshBtn');
  
  // Prevent multiple refreshes at once
  if (refreshBtn.classList.contains('spinning')) {
    return;
  }
  
  // Show spinning state on button only
  refreshBtn.classList.add('spinning');
  
  try {
    // Reset pagination for fresh data
    resetPagination();
    
    // Silently reload all data (no overlay, no visual disruption)
    await loadAllHistory(true);
    
    // Show subtle success notification
    showNotification('History refreshed', 'success');
    
  } catch (error) {
    // Log error in development only
    if (chrome.runtime.getManifest().version.includes('dev')) {
      console.error('Error refreshing data:', error);
    }
    showNotification('Failed to refresh history', 'error');
  } finally {
    // Remove spinning state from button
    refreshBtn.classList.remove('spinning');
  }
}

/**
 * Setup refresh button functionality
 */
function setupRefreshButton() {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshAllData);
  }
}

/**
 * Setup infinite scroll functionality
 */
function setupInfiniteScroll() {
  // Prevent multiple setups
  if (scrollListenersSetup) {
    return;
  }
  
  // Remove existing scroll listener to prevent duplicates
  const mainContent = document.querySelector('.main-content');
  
  if (mainContent) {
    mainContent.removeEventListener('scroll', handleInfiniteScroll);
    mainContent.addEventListener('scroll', handleInfiniteScroll);
  }
  
  // Also try attaching to window as backup
  window.removeEventListener('scroll', handleInfiniteScroll);
  window.addEventListener('scroll', handleInfiniteScroll);
  
  // Initialize scroll tracking
  lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  scrollDirection = 'down';
  
  scrollListenersSetup = true;
}

// Throttle scroll events for performance
let scrollTimeout;

// Track when last initial load happened to prevent immediate pagination
let lastInitialLoad = 0;
// Prevent multiple scroll listener setups
let scrollListenersSetup = false;
// Track scroll direction and position
let lastScrollY = 0;
let scrollDirection = 'down';
// Track loaded items to prevent duplicates
let loadedItemUrls = new Set();
let loadedDates = new Set();

/**
 * Handle infinite scroll detection
 */
function handleInfiniteScroll(e) {
  // Track scroll direction
  const currentScrollY = window.scrollY || document.documentElement.scrollTop;
  const scrollDelta = currentScrollY - lastScrollY;
  scrollDirection = scrollDelta > 0 ? 'down' : 'up';
  
  lastScrollY = currentScrollY;
  
  // Throttle scroll events to prevent excessive calls
  if (scrollTimeout) return;
  
  // Don't trigger pagination within 2 seconds of initial load
  if (Date.now() - lastInitialLoad < 2000) {
    return;
  }
  
  // Only process downward scrolls for pagination
  if (scrollDirection !== 'down' || scrollDelta < 5) {
    return;
  }
  
  scrollTimeout = setTimeout(async () => {
    const activeView = document.querySelector('.view.active');
    
    // Only trigger on Current Device view
    if (!activeView || activeView.id !== 'historyView') {
      scrollTimeout = null;
      return;
    }
    
    // Simple, clear scroll position calculation
    const windowScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    // How far from bottom are we?
    const distanceFromBottom = documentHeight - (windowScrollTop + windowHeight);
    
    // Trigger pagination when:
    // 1. Scrolling down
    // 2. Less than 300px from bottom 
    // 3. More content potentially available
    // 4. Not already loading
    const shouldTrigger = (
      scrollDirection === 'down' && 
      distanceFromBottom < 300 && 
      distanceFromBottom >= 0 &&
      !historyPagination.allLoaded &&
      !historyPagination.isLoading
    );
    
    if (shouldTrigger) {
      await loadMoreHistoryData();
    }
    
    scrollTimeout = null;
  }, 100); // 100ms throttle
}

/**
 * Create a single history item element
 */
async function createHistoryItemElement(item) {
  const faviconUrl = await getFaviconUrl(item.url);
  const visitTime = new Date(item.lastVisitTime);
  const timeString = visitTime.toLocaleTimeString('en-US', { 
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  const itemDiv = document.createElement('div');
  itemDiv.className = 'history-item';
  itemDiv.setAttribute('data-url', item.url);
  itemDiv.innerHTML = `
    <div class="history-time">${timeString}</div>
    <div class="history-content">
      <div class="tab-icon">
        <img class="tab-favicon" src="${faviconUrl}">
      </div>
      <div class="history-info">
        <div class="history-title">${sanitizeHtml(item.title) || 'Untitled'}</div>
        <div class="history-url">${sanitizeHtml(formatUrl(item.url))}</div>
      </div>
    </div>
    <div class="history-actions">
      <button class="action-btn visit-btn" title="Visit page">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1-2-2h6"/>
          <polyline points="15,3 21,3 21,9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </button>
      <button class="action-btn delete delete-btn" title="Remove from history">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3,6 5,6 21,6"/>
          <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2,2h4a2,2,0,0,1,2,2V6"/>
        </svg>
      </button>
    </div>
  `;
  return itemDiv;
}

/**
 * Reset pagination state
 */
function resetPagination() {
  historyPagination.currentEndTime = Date.now();
  historyPagination.itemsPerPage = 1000;
  historyPagination.allLoaded = false;  // Make sure this is false!
  historyPagination.isLoading = false;
  
  // Also reset scroll listener flag to allow fresh setup
  scrollListenersSetup = false;
  
  // Reset scroll tracking
  lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  scrollDirection = 'down';
  
  // Clear loaded items tracking
  loadedItemUrls.clear();
  loadedDates.clear();
}

/**
 * Load more history data and append to existing content
 */
async function loadMoreHistoryData() {
  // Prevent multiple simultaneous loads
  if (historyPagination.isLoading || historyPagination.allLoaded) {
    return;
  }
  
  historyPagination.isLoading = true;
  
  // Show subtle loading indicator at bottom
  const historyView = document.getElementById('historyView');
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'loading-more';
  loadingIndicator.innerHTML = `
    <div class="loading-more-content">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23,4 23,10 17,10"/>
        <polyline points="1,20 1,14 7,14"/>
        <path d="M20.49,9A9,9,0,0,0,5.64,5.64L1,10m22,4L18.36,18.36A9,9,0,0,1,3.51,15"/>
      </svg>
      <span>Loading more history...</span>
    </div>
  `;
  historyView.appendChild(loadingIndicator);
  
  try {
    // Load next batch of history using the new loadMoreHistory function
    const moreHistory = await loadMoreHistory();
    
    if (moreHistory.length === 0) {
      // No more history to load - loadMoreHistory() already set allLoaded = true
      return; // finally block will reset isLoading = false
    }
    
    // Find the history view to append to
    const historyView = document.getElementById('historyView');
    
    // Render and append new history sections, avoiding duplicate dates
    for (const group of moreHistory) {
      const dateKey = group.date;
      
      // Check if we already have this date displayed
      if (loadedDates.has(dateKey)) {
        // Find existing date section and append items
        const existingSection = document.querySelector(`[data-date="${dateKey}"] .history-items`);
        if (existingSection) {
          // Append new items to existing date section
          for (const item of group.items) {
            const itemElement = await createHistoryItemElement(item);
            existingSection.appendChild(itemElement);
          }
          continue; // Skip creating new section
        }
      }
      
      // Track this date and create new section
      loadedDates.add(dateKey);
      
      const newSection = document.createElement('div');
      newSection.className = 'history-date-section';
      newSection.setAttribute('data-date', dateKey);
      
      let sectionHtml = `
        <div class="date-header">${formatDateHeader(group.date)}</div>
        <div class="history-items">
      `;
      
      for (const item of group.items) {
        try {
          const faviconUrl = await getFaviconUrl(item.url);
          const visitTime = new Date(item.lastVisitTime);
          const timeString = visitTime.toLocaleTimeString('en-US', { 
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          
          sectionHtml += `
            <div class="history-item" data-url="${sanitizeHtml(item.url)}">
              <div class="history-time">${timeString}</div>
              <div class="history-content">
                <div class="tab-icon">
                  <img class="tab-favicon" src="${faviconUrl}">
                </div>
                <div class="history-info">
                  <div class="history-title">${sanitizeHtml(item.title) || 'Untitled'}</div>
                  <div class="history-url">${sanitizeHtml(formatUrl(item.url))}</div>
                </div>
              </div>
              <div class="history-actions">
                <button class="action-btn visit-btn" title="Visit page">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1-2-2h6"/>
                    <polyline points="15,3 21,3 21,9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </button>
                <button class="action-btn delete delete-btn" title="Remove from history">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3,6 5,6 21,6"/>
                    <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2,2h4a2,2,0,0,1,2,2V6"/>
                  </svg>
                </button>
              </div>
            </div>
          `;
        } catch (itemError) {
          // Log error in development only
          if (chrome.runtime.getManifest().version.includes('dev')) {
            console.warn('Error processing history item:', itemError);
          }
        }
      }
      
      sectionHtml += `</div>`;
      newSection.innerHTML = sectionHtml;
      
      // Append to history view
      historyView.appendChild(newSection);
    }
    
    // Set up event listeners for new content
    setupHistoryActions();
    
  } catch (error) {
    // Log error in development only
    if (chrome.runtime.getManifest().version.includes('dev')) {
      console.error('Error loading more history:', error);
    }
    showNotification('Failed to load more history', 'error');
  } finally {
    // Remove loading indicator
    const loadingIndicator = document.querySelector('.loading-more');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
    
    historyPagination.isLoading = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupSearch();
  setupRefreshButton();
  resetPagination(); // Initialize pagination
  loadAllHistory(); // Initial load, not a refresh
}); 