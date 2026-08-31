import re
with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

pattern = r"\s*// Filter out cold leads from map display\n\s*if \(sMap\.label === 'COLD'\) return;"
content = re.sub(pattern, "", content)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
