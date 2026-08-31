with open('public/ui/main_ui.js', 'r') as f:
    content = f.read()

import re

toast_pattern = r"window\.showToast = \(msg, type = 'success'\) => \{.*?setTimeout\(\(\) => t\.remove\(\), 400\); \}, 5000\);\n  \};"

toast_repl = """window.showToast = (msg, type = 'success') => {
    if (type === true) type = 'error';
    if (type === false) type = 'success';
    
    const existing = document.querySelectorAll('.app-toast');
    // Stack them vertically at the bottom
    existing.forEach((e, i) => {
      const currentBottom = parseInt(e.style.bottom) || 40;
      e.style.bottom = (currentBottom + 60) + 'px';
    });
    
    const t = document.createElement('div');
    t.className = `app-toast toast-${type}`;
    t.style.cssText = `position: fixed; left: 50%; bottom: -100px; transform: translateX(-50%); opacity: 0; z-index: 99999;`;
    t.innerHTML = msg;
    document.body.appendChild(t);
    
    requestAnimationFrame(() => { 
      t.style.bottom = '40px'; 
      t.style.opacity = '1'; 
    });
    
    setTimeout(() => { 
      t.style.bottom = '-100px'; 
      t.style.opacity = '0'; 
      setTimeout(() => t.remove(), 400); 
    }, 4500);
  };"""

content = re.sub(toast_pattern, toast_repl, content, flags=re.DOTALL)

with open('public/ui/main_ui.js', 'w') as f:
    f.write(content)
