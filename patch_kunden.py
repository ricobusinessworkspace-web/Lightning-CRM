with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

pattern = """      const rechnung = sortKanban(crmLeads.filter(l => l.rechnung === 1 && l.status === 'Lead'));

      const colHtml = (title, list) => `"""

replacement = """      const rechnung = sortKanban(crmLeads.filter(l => l.rechnung === 1 && l.status === 'Lead'));
      const kunden = sortKanban(leads.filter(l => l.status === 'Kunde'));

      const colHtml = (title, list) => `"""

if pattern in content:
    content = content.replace(pattern, replacement)
else:
    print("Pattern not found!")

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
