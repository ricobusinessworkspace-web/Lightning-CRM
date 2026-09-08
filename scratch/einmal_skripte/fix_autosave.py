import re
with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

# Remove the old global autosave block
bad_block = r"""    // --- AUTO-SAVE \(Phase 7\) ---
    const sidebarBody = document\.querySelector\('\.sidebar-body'\);
    const headerTitle = document\.querySelector\('\.sidebar-header'\);
    
    window\._triggerAutoSave = window\.debounce\(\(\) => \{
       if \(window\.store\.state\.currentSelectedLeadId === l\.id\) \{
           window\.saveLeadMain\(l\.id, true, true\)\.then\(\(success\) => \{
               if \(success === false\) return; // Error was already handled by saveLeadMain
               const toast = document\.createElement\('div'\);
               toast\.style\.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX\(-50%\); background:rgba\(48,209,88,0\.9\); color:white; padding:8px 16px; border-radius:20px; font-size:12px; font-weight:600; z-index:9999; pointer-events:none; opacity:1; transition:opacity 0\.3s;';
               toast\.textContent = 'Automatisch gespeichert ✓';
               document\.body\.appendChild\(toast\);
               setTimeout\(\(\) => \{ toast\.style\.opacity = '0'; setTimeout\(\(\) => toast\.remove\(\), 300\); \}, 1500\);
           \}\);
       \}
    \}, 1500\);
    
    if \(sidebarBody\) \{
       sidebarBody\.addEventListener\('input', window\._triggerAutoSave\);
       sidebarBody\.addEventListener\('change', window\._triggerAutoSave\);
    \}"""

content = re.sub(bad_block, "", content)

# Define the new lazy autosave block
lazy_autosave = """
window._triggerAutoSave = () => {
    if (!window._debouncedSave) {
        window._debouncedSave = window.debounce(() => {
            const id = window.store.state.currentSelectedLeadId;
            if (id) {
                window.saveLeadMain(id, true, true).then((success) => {
                    if (success === false) return;
                    const toast = document.createElement('div');
                    toast.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(48,209,88,0.9); color:white; padding:8px 16px; border-radius:20px; font-size:12px; font-weight:600; z-index:9999; pointer-events:none; opacity:1; transition:opacity 0.3s;';
                    toast.textContent = 'Automatisch gespeichert ✓';
                    document.body.appendChild(toast);
                    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 1500);
                });
            }
        }, 1500);
    }
    window._debouncedSave();
};
"""

content = content + lazy_autosave

# Add the event listener attachment to the end of openLeadDirectly
# We need to find the end of openLeadDirectly which is:
#     if (isSaving) {
#       setTimeout(() => {
#         const btn = document.getElementById('main-save-btn');
#         if (btn) {
#           btn.classList.remove('btn-success-flash');
#           btn.textContent = 'Speichern';
#         }
#       }, 2000);
#     }
#   };

end_of_open_lead = r"""    if \(isSaving\) \{
      setTimeout\(\(\) => \{
        const btn = document\.getElementById\('main-save-btn'\);
        if \(btn\) \{
          btn\.classList\.remove\('btn-success-flash'\);
          btn\.textContent = 'Speichern';
        \}
      \}, 2000\);
    \}"""

inject_listeners = """    if (isSaving) {
      setTimeout(() => {
        const btn = document.getElementById('main-save-btn');
        if (btn) {
          btn.classList.remove('btn-success-flash');
          btn.textContent = 'Speichern';
        }
      }, 2000);
    }
    
    // --- AUTO-SAVE LISTENERS (Phase 7) ---
    const sBody = document.querySelector('.sidebar-body');
    if (sBody) {
       sBody.removeEventListener('input', window._triggerAutoSave);
       sBody.removeEventListener('change', window._triggerAutoSave);
       sBody.addEventListener('input', window._triggerAutoSave);
       sBody.addEventListener('change', window._triggerAutoSave);
    }
"""

content = re.sub(end_of_open_lead, inject_listeners, content)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
