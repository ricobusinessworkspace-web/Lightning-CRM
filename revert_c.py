import re
with open('public/ui/main_ui.js', 'r') as f:
    content = f.read()

# Revert setPipeline
pattern = r"window\.setPipeline = async \(type\) => \{.*?document\.getElementById\('sys-k'\)\.value = k;\n\};"
repl = """window.setPipeline = async (type) => {
    let e = parseInt(document.getElementById('sys-e').value) || 0;
    let t = parseInt(document.getElementById('sys-t').value) || 0;
    let r = parseInt(document.getElementById('sys-r').value) || 0;
    let k = parseInt(document.getElementById('sys-k').value) || 0;

    if (type === 'cold') {
       e = 0; t = 0; r = 0; k = 0;
    }
    if (type === 'e') {
       e = e ? 0 : 1;
       if (e === 0) { t = 0; r = 0; k = 0; }
    }
    if (type === 't') {
       t = t ? 0 : 1;
       if (t) e = 1;
       if (t === 0) { r = 0; k = 0; }
    }
    if (type === 'r') {
       r = r ? 0 : 1;
       if (r) { e = 1; t = 1; }
       if (r === 0) k = 0;
    }
    if (type === 'k') {
       k = k ? 0 : 1;
       if (k) { e = 1; t = 1; r = 1; }
    }

    document.getElementById('sys-e').value = e;
    document.getElementById('sys-t').value = t;
    document.getElementById('sys-r').value = r;
    document.getElementById('sys-k').value = k;
};"""
content = re.sub(pattern, repl, content, flags=re.DOTALL)

# Revert saveLeadMain variables
save_pattern = r"let isCloseVal = parseInt\(document\.getElementById\('sys-c'\)\?\.value\) \|\| 0;\n\s*let isKundeVal ="
save_repl = "let isKundeVal ="
content = re.sub(save_pattern, save_repl, content)

# Revert status assignment
status_pattern = r"\} else if \(isCloseVal\) \{\n\s*payload\.status = 'Close';\n\s*\} else if \(lData && \(lData\.status === 'Kunde' \|\| lData\.status === 'Close'\)\) \{"
status_repl = "} else if (lData && lData.status === 'Kunde') {"
content = re.sub(status_pattern, status_repl, content)

with open('public/ui/main_ui.js', 'w') as f:
    f.write(content)
