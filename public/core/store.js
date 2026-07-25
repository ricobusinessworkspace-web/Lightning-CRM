class Store {
  constructor(initialState) {
    this.listeners = [];
    this.state = new Proxy(initialState, {
      set: (target, key, value) => {
        target[key] = value;
        this.notify(key, value);
        return true;
      }
    });
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify(key, value) {
    this.listeners.forEach(listener => listener(key, value, this.state));
  }
}

window.store = new Store({
  currentFilter1: 'all',
  currentFilter2: 'all',
  currentSearch: '',
  currentTab: 'tasks',
  currentSnoozeOffset: 0,
  currentSnoozeTargetMs: 0,
  isTaskMode: false,
  isKundeMode: false,
  currentSelectedLeadId: null,
  activeSessionId: null,
  isBulkMode: false,
  selectedBulkIds: new Set(),
  currentColdCallFilter: 'all',
  clearSnooze: false,
  currentMapStatusFilter: 'all',
  currentMapUserFilter: 'all'
});
