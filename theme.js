// Theme toggle functionality
document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('themeToggle');
  
  function setTheme(isDark) {
    if (isDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }

  // Get Chrome's current theme setting
  chrome.storage.sync.get(['darkMode'], (result) => {
    // This gets the actual Chrome profile theme setting
    setTheme(result.darkMode);
  });

  // Listen for theme toggle click
  themeToggle.addEventListener('click', () => {
    const isDark = !document.body.classList.contains('dark');
    setTheme(isDark);
    // Update Chrome's theme setting
    chrome.storage.sync.set({ darkMode: isDark });
  });
}); 