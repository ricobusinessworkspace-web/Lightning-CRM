with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

pattern1 = """          <div class="pipeline-bar" style="margin-top: 12px;">
            <div id="seg-1" class="pipe-seg ${e || t || r || isKunde ? 'active-blue' : ''}" onclick="setPipeline('e')">KEEPER</div>
            <div id="seg-2" class="pipe-seg ${t || isKunde ? 'active-orange' : ''}" onclick="setPipeline('t')">PITCH</div>
            <div id="seg-3" class="pipe-seg ${r || isKunde ? 'active-red' : ''}" onclick="setPipeline('r')">OFFER</div>
            <div id="seg-4" class="pipe-seg ${isKunde ? 'active-success' : ''}" onclick="setPipeline('k')">CLOSE</div>
          </div>"""

replacement1 = """          <div class="pipeline-bar" style="margin-top: 12px;">
            <div id="seg-0" class="pipe-seg ${!e && !t && !r && !isKunde ? 'active-gray' : ''}" onclick="setPipeline('cold')">COLD</div>
            <div id="seg-1" class="pipe-seg ${e || t || r || isKunde ? 'active-blue' : ''}" onclick="setPipeline('e')">PITCH</div>
            <div id="seg-2" class="pipe-seg ${t || isKunde ? 'active-orange' : ''}" onclick="setPipeline('t')">FOLLOW-UP</div>
            <div id="seg-3" class="pipe-seg ${r || isKunde ? 'active-red' : ''}" onclick="setPipeline('r')">OFFER</div>
            <div id="seg-4" class="pipe-seg ${isKunde ? 'active-success' : ''}" onclick="setPipeline('k')">CLOSE</div>
          </div>"""

if pattern1 in content:
    content = content.replace(pattern1, replacement1)
else:
    print("Pattern1 not found!")

pattern2 = """          ${colHtml('KEEPER', entscheider)}
          ${colHtml('PITCH', termin)}
          ${colHtml('OFFER', rechnung)}
          ${colHtml('CLOSE', kunden)}"""

replacement2 = """          ${colHtml('PITCH', entscheider)}
          ${colHtml('FOLLOW-UP', termin)}
          ${colHtml('OFFER', rechnung)}
          ${colHtml('CLOSE', kunden)}"""

if pattern2 in content:
    content = content.replace(pattern2, replacement2)
else:
    print("Pattern2 not found!")

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
