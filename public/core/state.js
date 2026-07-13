
  // STARTUP SPLASH ANIMATION
  setTimeout(() => {
    const splash = document.getElementById('startup-splash');
    if (splash) {
      splash.classList.add('splash-hidden');
      setTimeout(() => splash.remove(), 600);
    }
  }, 1500);

  const qList = document.getElementById('queue-container');
  const sidebar = document.querySelector('.sidebar');
  const chipContainer = document.getElementById('chip-container');
  
  let currentFilter1 = 'all';
  let currentFilter2 = 'all';
  let currentSearch = '';
  let currentTab = 'tasks';

  let currentSnoozeOffset = 0; 
  let currentSnoozeTargetMs = 0; 
  let isTaskMode = false;
  let isKundeMode = false;
  window._currentSelectedLeadId = null;
  window._activeSessionId = null;

  let isBulkMode = false;
  let selectedBulkIds = new Set();

  // ── Cold call status filter (Feature 6) ────────────────────────────────────
  // 'all' | 'never' | 'answered' | 'not_answered'
  let currentColdCallFilter = 'all';
  window.currentColdCallFilter = currentColdCallFilter;

  window.setColdCallFilter = (val) => {
    currentColdCallFilter = val;
    window.currentColdCallFilter = val;
    loadUi();
  };