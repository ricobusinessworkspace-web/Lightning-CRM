with open('public/ui/main_ui.js', 'r') as f:
    content = f.read()

pattern = """window.setPipeline = async (type) => {
    let e = parseInt(document.getElementById('sys-e').value) || 0;
    let t = parseInt(document.getElementById('sys-t').value) || 0;
    let r = parseInt(document.getElementById('sys-r').value) || 0;
    let k = parseInt(document.getElementById('sys-k').value) || 0;"""

replacement = """window.setPipeline = async (type) => {
    let e = parseInt(document.getElementById('sys-e').value) || 0;
    let t = parseInt(document.getElementById('sys-t').value) || 0;
    let r = parseInt(document.getElementById('sys-r').value) || 0;
    let k = parseInt(document.getElementById('sys-k').value) || 0;

    if (type === 'cold') {
       e = 0; t = 0; r = 0; k = 0;
    }"""

if pattern in content:
    content = content.replace(pattern, replacement)
else:
    print("Pattern for setPipeline not found!")

with open('public/ui/main_ui.js', 'w') as f:
    f.write(content)
