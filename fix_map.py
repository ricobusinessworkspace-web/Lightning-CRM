import re
with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

pattern = r"L\.tileLayer\('https://\{s\}\.basemaps\.cartocdn\.com/dark_all/\{z\}/\{x\}/\{y\}\{r\}\.png', \{"
repl = r"L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {"
content = re.sub(pattern, repl, content)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
