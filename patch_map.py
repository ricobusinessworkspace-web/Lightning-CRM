with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

pattern = """      // Filter out cold leads from map display
      if (sMap.label === 'Kalt') return;"""
repl = """      // Filter out cold leads from map display
      if (sMap.label === 'COLD') return;"""

content = content.replace(pattern, repl)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
