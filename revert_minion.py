import re
with open('core/db.js', 'r') as f:
    content = f.read()

content = content.replace(
    r"query = query.or(`and(status.eq.Lead,stage.eq.cold),claimed_by.eq.${currentUser.id}`);",
    r"query = query.or(`and(status.eq.Lead,entscheider.eq.0,termin.eq.0,rechnung.eq.0),claimed_by.eq.${currentUser.id}`);"
)

with open('core/db.js', 'w') as f:
    f.write(content)
