import re
with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

pattern = r"      // --- Manual KPIs Section ---.*?(?=      const teamSection = document\.createElement\('div'\);)"
new_content = re.sub(pattern, "", content, flags=re.DOTALL)

if new_content != content:
    with open('public/ui/pipeline_ui.js', 'w') as f:
        f.write(new_content)
else:
    print("Pattern for manual KPIs not found!")
