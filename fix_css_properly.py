import re

with open('styles.css', 'r') as f:
    content = f.read()

# 1. Replace the active-blue block (lines 351-354)
pattern1 = r"\.pipe-seg\.active-blue \{ background: rgba\(10, 132, 255, 0\.1\); color: #0a84ff; \}\n\.pipe-seg\.active-orange \{ background: rgba\(255, 159, 10, 0\.1\); color: #ff9f0a; \}\n\.pipe-seg\.active-red \{ background: rgba\(215, 0, 21, 0\.1\); color: #d70015; \}\n\.pipe-seg\.active-success \{ background: rgba\(48, 209, 88, 0\.1\); color: #30d158; \}"
repl1 = """/* Pipeline Segments */"""
content = re.sub(pattern1, repl1, content)

# 1.b Replace the box shadow block (lines 1176-1179)
pattern1b = r"\.pipe-seg\.active-blue \{ box-shadow: inset 0 0 12px rgba\(10, 132, 255, 0\.15\); \}\n\.pipe-seg\.active-orange \{ box-shadow: inset 0 0 12px rgba\(255, 159, 10, 0\.15\); \}\n\.pipe-seg\.active-red \{ box-shadow: inset 0 0 12px rgba\(215, 0, 21, 0\.15\); \}\n\.pipe-seg\.active-success \{ box-shadow: inset 0 0 12px rgba\(48, 209, 88, 0\.15\); \}"
repl1b = """/* Removed old active classes */"""
content = re.sub(pattern1b, repl1b, content)

# 2. Add p-close and pin-close
pattern2 = r"\.p-kunde \{ color: var\(--color-crm-customer\); \}"
repl2 = """.p-kunde { color: var(--color-crm-customer); }
.p-close { color: #8b0000; }"""
content = re.sub(pattern2, repl2, content)

pattern3 = r"\.pin-rechnung \{ color: var\(--color-crm-invoice\); \}"
repl3 = """.pin-rechnung { color: var(--color-crm-invoice); }
.pin-close { color: #8b0000; }"""
content = re.sub(pattern3, repl3, content)

# 3. Add UX overhaul at the end
ux_css = """

/* =========================================================================
   UX OVERHAUL (Animations, Buttons, Toasts)
   ========================================================================= */

/* Pipeline Active States */
.pipe-seg.active-cold { background: rgba(10, 132, 255, 0.1); color: #0a84ff; box-shadow: inset 0 0 12px rgba(10, 132, 255, 0.15); }
.pipe-seg.active-pitch { background: rgba(255, 214, 10, 0.1); color: #ffd60a; box-shadow: inset 0 0 12px rgba(255, 214, 10, 0.15); } /* Yellow */
.pipe-seg.active-data { background: rgba(255, 159, 10, 0.1); color: #ff9f0a; box-shadow: inset 0 0 12px rgba(255, 159, 10, 0.15); } /* Orange */
.pipe-seg.active-offer { background: rgba(215, 0, 21, 0.1); color: #d70015; box-shadow: inset 0 0 12px rgba(215, 0, 21, 0.15); }
.pipe-seg.active-close { background: rgba(139, 0, 0, 0.1); color: #8b0000; box-shadow: inset 0 0 12px rgba(139, 0, 0, 0.15); }
.pipe-seg.active-kunde { background: rgba(48, 209, 88, 0.1); color: #30d158; box-shadow: inset 0 0 12px rgba(48, 209, 88, 0.15); }

/* 1. Button & Interaction Feedback */
.action-btn, .action-btn-small, .nav-btn, .chip, .pipe-seg, .lead-card, .menu-item {
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), background 0.2s ease, box-shadow 0.2s ease !important;
  will-change: transform;
}
.action-btn:active, .action-btn-small:active, .nav-btn:active, .chip:active, .pipe-seg:active, .lead-card:active, .menu-item:active {
  transform: scale(0.97) !important;
}
.lead-card:hover {
  transform: translateY(-2px) scale(1.01) !important;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3) !important;
}
.lead-card.active-lead-card {
  transform: translateY(-2px) scale(1.01) !important;
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
"""

with open('styles.css', 'w') as f:
    f.write(content + ux_css)
