with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

pattern = """  window.updateLeadSize = async (id, newSize) => {
    try {
      await window.api.saveLead({ id, size: newSize });
      await window.openLeadDirectly(id, true, true);
    } catch(e) {
      console.error(e);
      alert('Fehler beim Speichern der Größe');
    }
  };"""

replacement = """  window.updateLeadSize = (id, newSize) => {
    // Just update DOM/Draft instead of auto-saving
    let hiddenInput = document.getElementById('m-size');
    if (!hiddenInput) {
      hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.id = 'm-size';
      document.body.appendChild(hiddenInput);
    }
    hiddenInput.value = newSize;

    const draft = typeof window.getDomDraft === 'function' ? window.getDomDraft() : null;
    if (draft) draft.size = newSize;

    const lead = window.store.state.leads.find(l => l.id === id);
    if (lead) lead.size = newSize;

    window.openLeadDirectly(id, true, true, draft);
  };"""

if pattern in content:
    content = content.replace(pattern, replacement)
else:
    print("Pattern not found for updateLeadSize!")

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
