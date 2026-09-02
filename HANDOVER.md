# Lightning CRM - Project Handover

## Overview
Lightning CRM is a modular, web-based Customer Relationship Management (CRM) tool primarily focused on lead generation, cold calling, and sales pipeline management. It is designed to be fast and heavily relies on vanilla web technologies for the frontend, with a modern cloud backend.

## Tech Stack & Architecture
- **Frontend Framework**: Vanilla JavaScript (ES Modules), HTML5, CSS3. No heavy frameworks (like React or Vue) are used. 
- **Build Tool / Dev Server**: [Vite](https://vitejs.dev/) (`vite.config.js`).
- **Backend / Database**: Migrated from a local SQLite setup to **Supabase** (PostgreSQL). Supabase provides real-time updates and authentication.
- **Serverless API**: Vercel Serverless Functions (located in `/api/`) handle privileged operations like user invites (`api/invite.js`) and push notifications.
- **Hosting / Deployment**: Designed for Vercel/Netlify auto-deployments.

## Core Features & Tabs
1. **Pipeline (`queue`)**: The default starting view. Manages leads progressing through various sales stages.
2. **Kaltakquise (`cold`)**: Optimized interface for cold calling sessions, including quick status updates and follow-ups.
3. **Aufgaben (`tasks`)**: Task management and mission briefings (Zero Inbox approach).
4. **Kunden (`customers`)**: Overview of won and active customers.
5. **Karte (`map`)**: Geographic view of leads using Leaflet.js.
6. **Radar Scout (`scout`)**: Integrated lead generation tool that scrapes data from Google Places / OpenStreetMap (Nominatim/Overpass).
7. **Command Center (`dashboard`)**: KPI tracking, metrics, and global reporting.

## Key Files & Directories
- `index.html`: The main entry point containing the UI layout, modals, and navigation.
- `public/ui/`: Contains the monolithic UI logic.
  - `pipeline_ui.js` (~2.6k lines): Handles the rendering and interaction for the pipeline and most list views.
  - `main_ui.js` (~1.2k lines): Handles global UI events, filtering, and bulk actions.
  - `init.js`: Bootstraps the app, checks authentication, and sets up Supabase real-time listeners.
- `public/core/`:
  - `store.js`: A custom, lightweight Proxy-based reactive state manager (`window.store`).
  - `api.js` / `db.js`: Abstraction layer for database operations (now pointing to Supabase, maintaining the legacy SQLite API signature for compatibility).
- `public/modules/`: Contains isolated features, like `scraper.js` for the Radar Scout feature.
- `api/`: Vercel serverless endpoints (e.g., `invite.js`, `push_sales_bell.js`).

## State Management
The application uses a globally accessible proxy-based store (`window.store`).
Any updates to `window.store.state` automatically trigger listeners. The primary function `loadUi()` re-renders the current view based on the state (e.g., `currentTab`).

## Recent Changes
- **Default Tab**: The default starting tab was recently changed from *Aufgaben* to *Pipeline*. This involved updating `currentTab: 'queue'` in `public/core/store.js` and adjusting the active CSS classes in `index.html`.

## Getting Started (Local Development)
1. Install dependencies: `npm install`
2. Start the Vite dev server: `npm run dev`
3. The app relies on Vercel environment variables (like `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`) for full backend functionality. Make sure these are linked if working locally with Vercel CLI (`vercel dev`).

## Deployment
The project is configured for Vercel. Any pushes to the `master` branch will trigger an automatic deployment.
```bash
git add .
git commit -m "feat/fix: description"
git push origin master
```
