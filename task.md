# Phase 1: State Management Refactoring
- [x] Create a centralized store (`public/core/store.js`) that uses a Proxy to hold UI state.
- [x] Migrate `public/ui/pipeline_ui.js`, `public/ui/main_ui.js`, and `public/core/leads.js` to use this new store instead of mutating global `window.*` variables.
- [x] Ensure the app still builds (`npm run build`) and functions properly.

# Phase 2: DB Filtering Refactoring
- [x] Push filtering logic to Supabase query in getLeads.
- [x] Keep JS sorting and specialized JS filtering intact.
- [x] RP-Level-System (Backend & Frontend HUD)
- [x] Command Center (Dashboard) Phase 2

# Phase 3: Gamification
- [x] Implement the Gamification 'Mission System' UI in the Lead Sidebar/Modal
- [x] Hierarchical Task System
- [x] Visual Task UI Overhaul
