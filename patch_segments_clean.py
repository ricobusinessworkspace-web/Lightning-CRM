with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

import re

seg_pattern = r'<div class="pipeline-bar" style="margin-top: 12px; display: flex; gap: 4px; overflow-x: auto;">.*?</div>\s*\$\{pitchCounterHtml\}'

seg_repl = """<div class="pipeline-bar" style="margin-top: 12px; display: flex; gap: 4px; overflow-x: auto;">
            <div id="seg-0" class="pipe-seg ${!e && !t && !r && l.status !== 'Close' && !isKunde ? 'active-cold' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('cold')">COLD</div>
            <div id="seg-1" class="pipe-seg ${e || t || r || l.status === 'Close' || isKunde ? 'active-pitch' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('e')">PITCH</div>
            <div id="seg-2" class="pipe-seg ${t || r || l.status === 'Close' || isKunde ? 'active-data' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('t')">DATA</div>
            <div id="seg-3" class="pipe-seg ${r || l.status === 'Close' || isKunde ? 'active-offer' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('r')">OFFER</div>
            <div id="seg-4" class="pipe-seg ${l.status === 'Close' || isKunde ? 'active-close' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('c')">CLOSE</div>
            <div id="seg-5" class="pipe-seg ${isKunde ? 'active-kunde' : ''}" style="flex:1; text-align:center; padding:6px; font-size:10px; border-radius:6px; cursor:pointer;" onclick="setPipeline('k')">KUNDE</div>
          </div>
          ${pitchCounterHtml}"""

content = re.sub(seg_pattern, seg_repl, content, flags=re.DOTALL)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
