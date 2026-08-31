import re
with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

# 1. Update the Hidden Inputs
pattern_inputs = r'<input type="hidden" id="sys-e".*?<input type="hidden" id="sys-k" value="\$\{isKunde \? 1 : 0\}">'
repl_inputs = """<input type="hidden" id="sys-e" value="${e ? 1 : 0}">
          <input type="hidden" id="sys-t" value="${t ? 1 : 0}">
          <input type="hidden" id="sys-r" value="${r ? 1 : 0}">
          <input type="hidden" id="sys-k" value="${isKunde ? 1 : 0}">"""
content = re.sub(pattern_inputs, repl_inputs, content, flags=re.DOTALL)

# 2. Update the Pipeline Bar (Segments)
pattern_bar = r'<div class="pipeline-bar" style="margin-top: 12px; display: flex; gap: 4px; overflow-x: auto;">.*?</div>\s*\$\{pitchCounterHtml\}'
repl_bar = """<div class="pipeline-bar" style="margin-top: 12px; display: flex; gap: 4px; overflow-x: auto;">
            <div id="seg-0" class="pipe-seg ${!e && !t && !r && !isKunde ? 'active-cold' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('cold')">COLD</div>
            <div id="seg-1" class="pipe-seg ${e || t || r || isKunde ? 'active-pitch' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('e')">PITCH</div>
            <div id="seg-2" class="pipe-seg ${t || r || isKunde ? 'active-data' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('t')">DATA</div>
            <div id="seg-3" class="pipe-seg ${r || isKunde ? 'active-offer' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('r')">OFFER</div>
            <div id="seg-4" class="pipe-seg ${isKunde ? 'active-kunde' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('k')">CLOSED</div>
          </div>
          ${pitchCounterHtml}"""
content = re.sub(pattern_bar, repl_bar, content, flags=re.DOTALL)

# 3. Update the Kanban Board Columns
pattern_board = r"const pitchList = sortKanban.*?const colHtml = \w+\('OFFER', offerList\)\}.*?\$\{colHtml\('CLOSE', closeList\)\}\n\s*</div>"
# wait, the pattern might be tricky. Let's just find and replace the board HTML
pattern_kanban = r"const pitchList = sortKanban.*?</div>\s*`;\n    \} else if"
repl_kanban = """const pitchList = sortKanban(crmLeads.filter(l => l.entscheider === 1 && !l.termin && !l.rechnung && l.status === 'Lead'));
      const dataList = sortKanban(crmLeads.filter(l => l.termin === 1 && !l.rechnung && l.status === 'Lead'));
      const offerList = sortKanban(crmLeads.filter(l => l.rechnung === 1 && l.status === 'Lead'));

      const colHtml = (title, list) => `
        <div class="kanban-column">
          <div class="kanban-header">
            <div class="kanban-title">${title}</div>
            <div class="kanban-count">${list.length}</div>
          </div>
          <div class="kanban-cards">
            ${list.length === 0 ? '<div class="empty-state" style="height:40px; font-size:12px;">Keine Leads</div>' : renderLeadList(list)}
          </div>
        </div>
      `;

      qList.innerHTML = `
        <div class="list-header" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
          <span>${tabTitle} (Pipeline)</span>
          <button id="bulk-mode-btn" class="action-btn-small ${window.store.state.isBulkMode ? 'outline' : ''}" onclick="toggleBulkMode()">
            ${window.store.state.isBulkMode ? 'Auswahl abbrechen' : 'Mehrfachauswahl'}
          </button>
        </div>
        <div class="kanban-board">
          ${colHtml('PITCH', pitchList)}
          ${colHtml('DATA', dataList)}
          ${colHtml('OFFER', offerList)}
        </div>
      `;
    } else if"""
content = re.sub(pattern_kanban, repl_kanban, content, flags=re.DOTALL)

# 4. Update getLeadStatusMap labels
pattern_status_map = r"window\.getLeadStatusMap = \(l\) => \{.*?let hasActive = false;"
repl_status_map = """window.getLeadStatusMap = (l) => {
    let res = { color: 'p-kalt', label: 'COLD', mapPin: 'pin-kalt' };
    if (l.status === 'Kunde') res = { color: 'p-kunde', label: 'CLOSED', mapPin: 'pin-kunde' };
    else if (l.status === 'Uninteressant') res = { color: 'p-excluded', label: 'Ausgeschlossen 🚫', mapPin: 'pin-excluded' };
    else if (l.rechnung) res = { color: 'p-rechnung', label: 'OFFER', mapPin: 'pin-rechnung' };
    else if (l.termin) res = { color: 'p-termin', label: 'DATA', mapPin: 'pin-termin' };
    else if (l.entscheider) res = { color: 'p-entscheider', label: 'PITCH', mapPin: 'pin-entscheider' };
    
    let hasActive = false;"""
content = re.sub(pattern_status_map, repl_status_map, content, flags=re.DOTALL)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
