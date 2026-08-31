with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

pattern = """    if(!l) return;

    if (draft) {"""

replacement = """    if(!l) return;

    try {
      const fullHistory = await window.api.getLeadHistory(l.id);
      l.call_history = fullHistory.crm_calls || [];
      l.lead_activities = fullHistory.lead_activities || [];
    } catch(e) {
      console.error(e);
    }

    if (draft) {"""

content = content.replace(pattern, replacement)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
