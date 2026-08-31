import re

with open('core/db.js', 'r') as f:
    content = f.read()

pattern = r"    query = query\.order\('ts', \{ foreignTable: 'crm_calls', ascending: true \}\);"
replacement = """    query = query
      .order('ts', { foreignTable: 'crm_calls', ascending: false }).limit(3, { foreignTable: 'crm_calls' })
      .order('ts', { foreignTable: 'lead_activities', ascending: false }).limit(3, { foreignTable: 'lead_activities' });"""

new_content = content.replace(pattern.replace('\\.', '.').replace('\\(', '(').replace('\\)', ')').replace('\\{', '{').replace('\\}', '}'), replacement)

with open('core/db.js', 'w') as f:
    f.write(new_content)
