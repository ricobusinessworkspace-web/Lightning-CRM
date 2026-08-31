with open('styles.css', 'r') as f:
    content = f.read()

import re

# Remove old pipe-seg active classes and add new ones
pattern = r"\.pipe-seg\.active-blue \{.*?\.pipe-seg\.active-success \{ box-shadow: inset 0 0 12px rgba\(48, 209, 88, 0\.15\); \}"

repl = """.pipe-seg.active-cold { background: rgba(10, 132, 255, 0.1); color: #0a84ff; box-shadow: inset 0 0 12px rgba(10, 132, 255, 0.15); }
.pipe-seg.active-pitch { background: rgba(255, 159, 10, 0.1); color: #ff9f0a; box-shadow: inset 0 0 12px rgba(255, 159, 10, 0.15); }
.pipe-seg.active-data { background: rgba(255, 69, 58, 0.1); color: #ff453a; box-shadow: inset 0 0 12px rgba(255, 69, 58, 0.15); }
.pipe-seg.active-offer { background: rgba(215, 0, 21, 0.1); color: #d70015; box-shadow: inset 0 0 12px rgba(215, 0, 21, 0.15); }
.pipe-seg.active-close { background: rgba(139, 0, 0, 0.1); color: #8b0000; box-shadow: inset 0 0 12px rgba(139, 0, 0, 0.15); }
.pipe-seg.active-kunde { background: rgba(48, 209, 88, 0.1); color: #30d158; box-shadow: inset 0 0 12px rgba(48, 209, 88, 0.15); }"""

content = re.sub(pattern, repl, content, flags=re.DOTALL)

with open('styles.css', 'w') as f:
    f.write(content)
