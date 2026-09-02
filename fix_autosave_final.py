import re

# 1. Fix main_ui.js (pendingLocalWrites and setPipeline trigger)
with open('public/ui/main_ui.js', 'r') as f:
    main_content = f.read()

# Add pendingLocalWrites to saveLeadMain
main_content = main_content.replace(
    "window._sessionRecentLeads.add(id);",
    "window._sessionRecentLeads.add(id);\n    window.pendingLocalWrites = window.pendingLocalWrites || new Set();\n    window.pendingLocalWrites.add(id);"
)

# Add _triggerAutoSave to setPipeline
set_pipeline_end = r"""    if \(stage === 'offer' && s3\) s3\.classList\.add\('active-offer'\);
    if \(stage === 'closed' && s4\) s4\.classList\.add\('active-kunde'\);
  \};"""

set_pipeline_fixed = """    if (stage === 'offer' && s3) s3.classList.add('active-offer');
    if (stage === 'closed' && s4) s4.classList.add('active-kunde');
    
    // Trigger Auto-Save instantly when pipeline status changes
    if (window._triggerAutoSave) window._triggerAutoSave();
  };"""

main_content = re.sub(set_pipeline_end, set_pipeline_fixed, main_content)

with open('public/ui/main_ui.js', 'w') as f:
    f.write(main_content)


# 2. Fix pipeline_ui.js (toast spam and event listeners)
with open('public/ui/pipeline_ui.js', 'r') as f:
    pipe_content = f.read()

# Remove the spammy toast and change the event from 'input' to 'focusout' (blur) so it doesn't fire 10 times while typing
spammy_toast = r"""                    const toast = document\.createElement\('div'\);
                    toast\.style\.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX\(-50%\); background:rgba\(48,209,88,0\.9\); color:white; padding:8px 16px; border-radius:20px; font-size:12px; font-weight:600; z-index:9999; pointer-events:none; opacity:1; transition:opacity 0\.3s;';
                    toast\.textContent = 'Automatisch gespeichert ✓';
                    document\.body\.appendChild\(toast\);
                    setTimeout\(\(\) => \{ toast\.style\.opacity = '0'; setTimeout\(\(\) => toast\.remove\(\), 300\); \}, 1500\);"""

pipe_content = re.sub(spammy_toast, "/* Saved silently */", pipe_content)

# Change listeners to focusout instead of input (so it saves on blur instead of every keystroke)
listeners_old = r"""       sBody\.removeEventListener\('input', window\._triggerAutoSave\);
       sBody\.removeEventListener\('change', window\._triggerAutoSave\);
       sBody\.addEventListener\('input', window\._triggerAutoSave\);
       sBody\.addEventListener\('change', window\._triggerAutoSave\);"""

listeners_new = """       sBody.removeEventListener('focusout', window._triggerAutoSave);
       sBody.removeEventListener('change', window._triggerAutoSave);
       sBody.addEventListener('focusout', window._triggerAutoSave);
       sBody.addEventListener('change', window._triggerAutoSave);"""

pipe_content = re.sub(listeners_old, listeners_new, pipe_content)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(pipe_content)
