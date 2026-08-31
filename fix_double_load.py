import re
with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

pattern = r"await loadUi\(\);\n\s*await loadUi\(\);"
repl = r"await loadUi();"
content = re.sub(pattern, repl, content)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
