import re
with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

bad_block = r"""    if \(headerTitle\) \{
       headerTitle\.addEventListener\('input', window\._triggerAutoSave\);
       headerTitle\.addEventListener\('change', window\._triggerAutoSave\);
    \}"""

content = re.sub(bad_block, "", content)

# I should also add headerTitle to the openLeadDirectly block where I added sBody!
inject_listeners = r"""    // --- AUTO-SAVE LISTENERS \(Phase 7\) ---
    const sBody = document\.querySelector\('\.sidebar-body'\);
    if \(sBody\) \{
       sBody\.removeEventListener\('input', window\._triggerAutoSave\);
       sBody\.removeEventListener\('change', window\._triggerAutoSave\);
       sBody\.addEventListener\('input', window\._triggerAutoSave\);
       sBody\.addEventListener\('change', window\._triggerAutoSave\);
    \}"""

better_listeners = """    // --- AUTO-SAVE LISTENERS (Phase 7) ---
    const sBody = document.querySelector('.sidebar-body');
    const hTitle = document.querySelector('.sidebar-header');
    if (sBody) {
       sBody.removeEventListener('input', window._triggerAutoSave);
       sBody.removeEventListener('change', window._triggerAutoSave);
       sBody.addEventListener('input', window._triggerAutoSave);
       sBody.addEventListener('change', window._triggerAutoSave);
    }
    if (hTitle) {
       hTitle.removeEventListener('input', window._triggerAutoSave);
       hTitle.removeEventListener('change', window._triggerAutoSave);
       hTitle.addEventListener('input', window._triggerAutoSave);
       hTitle.addEventListener('change', window._triggerAutoSave);
    }"""

content = re.sub(inject_listeners, better_listeners, content)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
