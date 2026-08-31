with open('styles.css', 'a') as f:
    f.write("""

/* =========================================================================
   UX OVERHAUL (Animations, Buttons, Toasts)
   ========================================================================= */

/* 1. Button & Interaction Feedback */
.action-btn, .action-btn-small, .nav-btn, .chip, .pipe-seg, .lead-card, .menu-item {
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), background 0.2s ease, box-shadow 0.2s ease !important;
  will-change: transform;
}
.action-btn:active, .action-btn-small:active, .nav-btn:active, .chip:active, .pipe-seg:active, .lead-card:active, .menu-item:active {
  transform: scale(0.97) !important;
}

/* 2. Toasts */
.app-toast {
  background: rgba(28, 28, 30, 0.75) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  border-radius: 100px !important;
  padding: 12px 24px 12px 20px !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4) !important;
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
  font-weight: 500 !important;
  font-size: 14px !important;
  color: #fff !important;
}
.toast-success::before {
  content: '✓';
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: var(--success, #30d158);
  color: #000;
  border-radius: 50%;
  font-size: 13px;
  font-weight: bold;
}
.toast-error::before {
  content: '✕';
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: var(--color-intent-danger, #ff453a);
  color: #fff;
  border-radius: 50%;
  font-size: 13px;
  font-weight: bold;
}

/* 3. Loading Indicators (Buttons) */
.btn-loading {
  position: relative;
  color: transparent !important;
  pointer-events: none;
}
.btn-loading::after {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  width: 18px; height: 18px;
  margin-top: -9px; margin-left: -9px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ux-spinner 0.6s linear infinite;
}
@keyframes ux-spinner {
  to { transform: rotate(360deg); }
}
.btn-success-flash {
  background: var(--success, #30d158) !important;
  color: #000 !important;
  border-color: var(--success, #30d158) !important;
  transition: all 0.3s cubic-bezier(0.2, 0, 0, 1) !important;
}

/* 4. Sidebar Slide-In */
.sidebar-body, .sidebar-header, #lead-sidebar-content > div {
  animation: ux-slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes ux-slideInRight {
  from { opacity: 0; transform: translateX(30px); }
  to { opacity: 1; transform: translateX(0); }
}

/* Confirm Dialog Overlay */
.confirm-overlay {
  animation: ux-fadeIn 0.2s ease forwards;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  background: rgba(0,0,0,0.5) !important;
}
.confirm-overlay > div {
  animation: ux-popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
@keyframes ux-fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes ux-popIn {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* 5. Staggered List / Kanban Cards Fade-in */
.lead-card {
  animation: ux-fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}
@keyframes ux-fadeInUp {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}
/* Staggering delays for natural feel */
.lead-card:nth-child(1) { animation-delay: 0.03s; }
.lead-card:nth-child(2) { animation-delay: 0.06s; }
.lead-card:nth-child(3) { animation-delay: 0.09s; }
.lead-card:nth-child(4) { animation-delay: 0.12s; }
.lead-card:nth-child(5) { animation-delay: 0.15s; }
.lead-card:nth-child(6) { animation-delay: 0.18s; }
.lead-card:nth-child(7) { animation-delay: 0.21s; }
.lead-card:nth-child(8) { animation-delay: 0.24s; }
.lead-card:nth-child(9) { animation-delay: 0.27s; }
.lead-card:nth-child(n+10) { animation-delay: 0.30s; }
""")

# Fix the confirm dialog layout so it uses flex correctly in JS by modifying JS or injecting CSS
