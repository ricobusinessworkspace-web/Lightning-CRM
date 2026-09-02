import re
with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

# Fix visual mappings (entscheider, termin, rechnung) in renderLeadList
mapping_old = r"""    else if \(l\.entscheider\) res = \{ color: 'p-entscheider', label: 'PITCH', mapPin: 'pin-entscheider' \};"""
mapping_new = """    else if (stage === 'PITCH') res = { color: 'p-entscheider', label: 'PITCH', mapPin: 'pin-entscheider' };"""
content = re.sub(mapping_old, mapping_new, content)

# Fix cold leads filter
cold_filter = r"      let coldLeads = leads\.filter\(l => !l\.entscheider && !l\.termin && !l\.rechnung && l\.status === 'Lead'\);"
new_cold_filter = "      let coldLeads = leads.filter(l => window.api.getStage(l) === 'COLD' && l.status === 'Lead');"
content = re.sub(cold_filter, new_cold_filter, content)

# Fix map lead colors
map_colors = r"""          else if \(lead\.rechnung\) leadColor = 'var\(--color-crm-invoice, #ff453a\)';
          else if \(lead\.termin\) leadColor = 'var\(--color-crm-contact, #ff9f0a\)';
          else if \(lead\.entscheider\) leadColor = 'var\(--color-crm-decision, #ffd60a\)';"""
new_map_colors = """          else if (lead.stage === 'offer' || lead.stage === 'data') leadColor = 'var(--color-crm-invoice, #ff453a)';
          else if (lead.stage === 'pitch') leadColor = 'var(--color-crm-contact, #ff9f0a)';"""
content = re.sub(map_colors, new_map_colors, content)

# Remove sys-e, sys-t, sys-r from hidden inputs in sidebar
hidden_inputs = r"""          <input type="hidden" id="sys-e" value="\$\{e \? 1 : 0\}">
          <input type="hidden" id="sys-stage" value="\$\{window\.api\.getStage\(l\)\.toLowerCase\(\)\}">
          <input type="hidden" id="sys-t" value="\$\{t \? 1 : 0\}">
          <input type="hidden" id="sys-r" value="\$\{r \? 1 : 0\}">"""
new_hidden_inputs = """          <input type="hidden" id="sys-stage" value="${window.api.getStage(l).toLowerCase()}">"""
content = re.sub(hidden_inputs, new_hidden_inputs, content)

# Also remove e, t, r extraction in openLeadDirectly
extraction = r"""    const e = l\.entscheider === 1;
    const t = l\.termin === 1;
    const r = l\.rechnung === 1;
    const isKunde = l\.status === 'Kunde';"""
new_extraction = "    const isKunde = l.status === 'Kunde';"
content = re.sub(extraction, new_extraction, content)


with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
