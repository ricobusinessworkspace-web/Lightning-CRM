import re
with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

pattern = r"allActs\.sort\(\(a,b\) => b\.ts - a\.ts\);"
repl = r"allActs.sort((a,b) => (b.ts || 0) - (a.ts || 0));"
content = re.sub(pattern, repl, content)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
