with open('public/ui/main_ui.js', 'r') as f:
    content = f.read()

import re

# Match setPipeline block
pattern = r"window\.setPipeline = async \(type\) => \{.*?document\.getElementById\('sys-k'\)\.value = k;\n\s*\};"
repl = """window.setPipeline = async (type) => {
    let e = parseInt(document.getElementById('sys-e').value) || 0;
    let t = parseInt(document.getElementById('sys-t').value) || 0;
    let r = parseInt(document.getElementById('sys-r').value) || 0;
    let c = parseInt(document.getElementById('sys-c').value) || 0;
    let k = parseInt(document.getElementById('sys-k').value) || 0;

    if (type === 'cold') {
       e = 0; t = 0; r = 0; c = 0; k = 0;
    }
    if (type === 'e') {
       e = e ? 0 : 1;
       if (e === 0) { t = 0; r = 0; c = 0; k = 0; }
    }
    if (type === 't') {
       t = t ? 0 : 1;
       if (t) e = 1;
       if (t === 0) { r = 0; c = 0; k = 0; }
    }
    if (type === 'r') {
       r = r ? 0 : 1;
       if (r) { e = 1; t = 1; }
       if (r === 0) { c = 0; k = 0; }
    }
    if (type === 'c') {
       c = c ? 0 : 1;
       if (c) { e = 1; t = 1; r = 1; k = 0; }
    }
    if (type === 'k') {
       k = k ? 0 : 1;
       if (k) { e = 1; t = 1; r = 1; c = 0; }
    }

    document.getElementById('sys-e').value = e;
    document.getElementById('sys-t').value = t;
    document.getElementById('sys-r').value = r;
    document.getElementById('sys-c').value = c;
    document.getElementById('sys-k').value = k;
};"""

content = re.sub(pattern, repl, content, flags=re.DOTALL)

save_pattern = """      let entscheider = parseInt(document.getElementById('sys-e')?.value) || 0;
      let termin = parseInt(document.getElementById('sys-t')?.value) || 0;
      let rechnung = parseInt(document.getElementById('sys-r')?.value) || 0;
      let isKundeVal = parseInt(document.getElementById('sys-k')?.value) || 0;"""

save_repl = """      let entscheider = parseInt(document.getElementById('sys-e')?.value) || 0;
      let termin = parseInt(document.getElementById('sys-t')?.value) || 0;
      let rechnung = parseInt(document.getElementById('sys-r')?.value) || 0;
      let isCloseVal = parseInt(document.getElementById('sys-c')?.value) || 0;
      let isKundeVal = parseInt(document.getElementById('sys-k')?.value) || 0;"""

content = content.replace(save_pattern, save_repl)

status_pattern = """      if (isKundeVal) {
        payload.status = 'Kunde';
      } else if (lData && lData.status === 'Kunde') {
        payload.status = 'Lead';
      }"""

status_repl = """      if (isKundeVal) {
        payload.status = 'Kunde';
      } else if (isCloseVal) {
        payload.status = 'Close';
      } else if (lData && (lData.status === 'Kunde' || lData.status === 'Close')) {
        payload.status = 'Lead';
      }"""

content = content.replace(status_pattern, status_repl)

with open('public/ui/main_ui.js', 'w') as f:
    f.write(content)
