import re
with open('styles.css', 'r') as f:
    content = f.read()

pattern_pitch = r"\.pipe-seg\.active-pitch \{ background: rgba\(255, 159, 10, 0\.1\); color: #ff9f0a; box-shadow: inset 0 0 12px rgba\(255, 159, 10, 0\.15\); \}"
repl_pitch = ".pipe-seg.active-pitch { background: rgba(255, 214, 10, 0.1); color: #ffd60a; box-shadow: inset 0 0 12px rgba(255, 214, 10, 0.15); } /* Yellow */"
content = re.sub(pattern_pitch, repl_pitch, content)

pattern_data = r"\.pipe-seg\.active-data \{ background: rgba\(255, 69, 58, 0\.1\); color: #ff453a; box-shadow: inset 0 0 12px rgba\(255, 69, 58, 0\.15\); \}"
repl_data = ".pipe-seg.active-data { background: rgba(255, 159, 10, 0.1); color: #ff9f0a; box-shadow: inset 0 0 12px rgba(255, 159, 10, 0.15); } /* Orange */"
content = re.sub(pattern_data, repl_data, content)

with open('styles.css', 'w') as f:
    f.write(content)
