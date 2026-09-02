import re
with open('core/db.js', 'r') as f:
    content = f.read()

content = content.replace(
    'let currentUser = { id: "575dae28-49b9-47f3-ac9b-84eb1830eaac" }; // caches { id, name, role }',
    'let currentUser = null; // caches { id, name, role }'
)

with open('core/db.js', 'w') as f:
    f.write(content)
