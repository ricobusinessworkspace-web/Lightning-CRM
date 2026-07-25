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

  window.setColdCallFilter = (val) => {
    window.store.state.currentColdCallFilter = val;
    loadUi();
  };