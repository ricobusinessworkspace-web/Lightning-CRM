with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

import re

kanban_pattern = r"const entscheider = sortKanban.*?const colHtml ="
kanban_repl = """const pitchList = sortKanban(crmLeads.filter(l => l.entscheider === 1 && !l.termin && !l.rechnung && l.status === 'Lead'));
      const dataList = sortKanban(crmLeads.filter(l => l.termin === 1 && !l.rechnung && l.status === 'Lead'));
      const offerList = sortKanban(crmLeads.filter(l => l.rechnung === 1 && l.status === 'Lead'));
      const closeList = sortKanban(crmLeads.filter(l => l.status === 'Close'));

      const colHtml ="""
content = re.sub(kanban_pattern, kanban_repl, content, flags=re.DOTALL)

board_pattern = r"\$\{colHtml\('PITCH', entscheider\)\}.*?\$\{colHtml\('CLOSE', kunden\)\}"
board_repl = """${colHtml('PITCH', pitchList)}
          ${colHtml('DATA', dataList)}
          ${colHtml('OFFER', offerList)}
          ${colHtml('CLOSE', closeList)}"""
content = re.sub(board_pattern, board_repl, content, flags=re.DOTALL)

# Update getLeadStatusMap
status_map_pattern = r"window\.getLeadStatusMap = \(l\) => \{.*?\n    let hasActive = false;"
status_map_repl = """window.getLeadStatusMap = (l) => {
    let res = { color: 'p-kalt', label: 'COLD', mapPin: 'pin-kalt' };
    if (l.status === 'Kunde') res = { color: 'p-kunde', label: 'KUNDE', mapPin: 'pin-kunde' };
    else if (l.status === 'Close') res = { color: 'p-close', label: 'CLOSE', mapPin: 'pin-close' };
    else if (l.status === 'Uninteressant') res = { color: 'p-excluded', label: 'Ausgeschlossen 🚫', mapPin: 'pin-excluded' };
    else if (l.rechnung) res = { color: 'p-rechnung', label: 'OFFER', mapPin: 'pin-rechnung' };
    else if (l.termin) res = { color: 'p-termin', label: 'DATA', mapPin: 'pin-termin' };
    else if (l.entscheider) res = { color: 'p-entscheider', label: 'PITCH', mapPin: 'pin-entscheider' };
    
    let hasActive = false;"""
content = re.sub(status_map_pattern, status_map_repl, content, flags=re.DOTALL)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
