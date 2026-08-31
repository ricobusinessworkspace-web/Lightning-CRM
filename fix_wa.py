import re
with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

pattern = r"renderWhatsAppIcon\(l\.phone\)\.replace\('<a', '<a style=\"background: rgba\(37, 211, 102, 0\.1\); padding: 8px 12px; border-radius: 8px;\"'\)"
repl = r"renderWhatsAppIcon(l.phone).replace('<a', '<a style=\"background: rgba(37, 211, 102, 0.1); color: #25D366 !important; padding: 8px 12px; border-radius: 8px;\"')"
content = re.sub(pattern, repl, content)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
