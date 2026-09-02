import re
with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

replacement = """
    } else {
      let leads = [];
      try {
         leads = await window.api.getLeads(filters);
      } catch(err) {
         console.error('getLeads crash in renderPipeline:', err);
         showToast('Lade-Fehler: ' + err.message, 'error', 10000);
         const qList = document.querySelector('.kanban-scroll-area');
         if (qList) qList.innerHTML = `<div style="padding: 20px; color: red;">Fehler beim Laden der Leads:<br>${err.message}</div>`;
         return;
      }
"""

content = re.sub(
    r"    \} else \{\n      let leads = await window\.api\.getLeads\(filters\);",
    replacement,
    content
)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
