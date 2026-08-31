with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

import re

# Add sys-c hidden input
pattern = r'<input type="hidden" id="sys-e" value="\$\{e \? 1 : 0\}">.*?<input type="hidden" id="sys-k" value="\$\{isKunde \? 1 : 0\}">'
repl = """<input type="hidden" id="sys-e" value="${e ? 1 : 0}">
          <input type="hidden" id="sys-t" value="${t ? 1 : 0}">
          <input type="hidden" id="sys-r" value="${r ? 1 : 0}">
          <input type="hidden" id="sys-c" value="${l.status === 'Close' ? 1 : 0}">
          <input type="hidden" id="sys-k" value="${isKunde ? 1 : 0}">"""

content = re.sub(pattern, repl, content, flags=re.DOTALL)

# Update segments
seg_pattern = r'<div class="pipeline-bar" style="margin-top: 12px;">.*?</div>\s*\$\{pitchCounterHtml\}'

seg_repl = """<div class="pipeline-bar" style="margin-top: 12px; display: flex; gap: 4px; overflow-x: auto;">
            <div id="seg-0" class="pipe-seg ${!e && !t && !r && l.status !== 'Close' && !isKunde ? 'active-gray' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; background: rgba(10, 132, 255, 0.1); color: ${!e && !t && !r && l.status !== 'Close' && !isKunde ? '#0a84ff' : 'var(--text-muted)'}; cursor:pointer;" onclick="setPipeline('cold')">COLD</div>
            <div id="seg-1" class="pipe-seg ${e || t || r || l.status === 'Close' || isKunde ? 'active-pitch' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; background: rgba(255, 159, 10, 0.1); color: ${e || t || r || l.status === 'Close' || isKunde ? '#ff9f0a' : 'var(--text-muted)'}; cursor:pointer;" onclick="setPipeline('e')">PITCH</div>
            <div id="seg-2" class="pipe-seg ${t || r || l.status === 'Close' || isKunde ? 'active-data' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; background: rgba(255, 69, 58, 0.1); color: ${t || r || l.status === 'Close' || isKunde ? '#ff453a' : 'var(--text-muted)'}; cursor:pointer;" onclick="setPipeline('t')">DATA</div>
            <div id="seg-3" class="pipe-seg ${r || l.status === 'Close' || isKunde ? 'active-offer' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; background: rgba(215, 0, 21, 0.1); color: ${r || l.status === 'Close' || isKunde ? '#d70015' : 'var(--text-muted)'}; cursor:pointer;" onclick="setPipeline('r')">OFFER</div>
            <div id="seg-4" class="pipe-seg ${l.status === 'Close' || isKunde ? 'active-close' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; background: rgba(139, 0, 0, 0.1); color: ${l.status === 'Close' || isKunde ? '#8b0000' : 'var(--text-muted)'}; cursor:pointer;" onclick="setPipeline('c')">CLOSE</div>
            <div id="seg-5" class="pipe-seg ${isKunde ? 'active-kunde' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; background: rgba(48, 209, 88, 0.1); color: ${isKunde ? '#30d158' : 'var(--text-muted)'}; cursor:pointer;" onclick="setPipeline('k')">KUNDE</div>
          </div>
          ${pitchCounterHtml}"""

content = re.sub(seg_pattern, seg_repl, content, flags=re.DOTALL)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
