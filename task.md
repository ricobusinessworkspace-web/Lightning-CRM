# Phase 1: State Management Refactoring
- [x] Create a centralized store (`public/core/store.js`) that uses a Proxy to hold UI state.
- [x] Migrate `public/ui/pipeline_ui.js`, `public/ui/main_ui.js`, and `public/core/leads.js` to use this new store instead of mutating global `window.*` variables.
- [x] Ensure the app still builds (`npm run build`) and functions properly.
