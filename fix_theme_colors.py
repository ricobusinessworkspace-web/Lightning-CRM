import re
with open('theme.css', 'r') as f:
    content = f.read()

pattern_pitch = r"--color-crm-decision: #ff9f0a; /\* PITCH: Orange \*/"
repl_pitch = "--color-crm-decision: #ffd60a; /* PITCH: Yellow */"
content = re.sub(pattern_pitch, repl_pitch, content)

pattern_data = r"--color-crm-appointment: #ff453a; /\* DATA: Orange-Red \*/"
repl_data = "--color-crm-appointment: #ff9f0a; /* DATA: Orange */"
content = re.sub(pattern_data, repl_data, content)

with open('theme.css', 'w') as f:
    f.write(content)
