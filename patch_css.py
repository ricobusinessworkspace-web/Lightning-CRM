with open('styles.css', 'r') as f:
    content = f.read()

import re

# Add p-close and pin-close near p-kunde
pattern = r"\.p-kunde \{ color: var\(--color-crm-customer\); \}"
repl = """.p-kunde { color: var(--color-crm-customer); }
.p-close { color: #8b0000; }"""
content = re.sub(pattern, repl, content)

pattern_pin = r"\.pin-rechnung \{ color: var\(--color-crm-invoice\); \}"
repl_pin = """.pin-rechnung { color: var(--color-crm-invoice); }
.pin-close { color: #8b0000; }"""
content = re.sub(pattern_pin, repl_pin, content)

with open('styles.css', 'w') as f:
    f.write(content)
