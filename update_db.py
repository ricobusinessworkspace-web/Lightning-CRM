import re
with open('core/db.js', 'r') as f:
    content = f.read()

# Revert queue tab query
pattern_queue = r"if \(filters\.filter1 !== 'kunden'\) \{\n\s*query = query\.in\('status', \['Lead', 'Close'\]\);\n\s*\}"
repl_queue = """if (filters.filter1 !== 'kunden') {
          query = query.eq('status', 'Lead');
        }"""
content = re.sub(pattern_queue, repl_queue, content)

# Revert logStatusChange
pattern_log = r"if \(payload\.status === 'Close' && existing\.status !== 'Close'\) await window\.api\.logStatusChange\(lead\.id, 'CLOSE'\);\n\s*if \(payload\.status === 'Kunde' && existing\.status !== 'Kunde'\) await window\.api\.logStatusChange\(lead\.id, 'KUNDE'\);"
repl_log = "if (payload.status === 'Kunde' && existing.status !== 'Kunde') await window.api.logStatusChange(lead.id, 'CLOSED');"
content = re.sub(pattern_log, repl_log, content)

# Also fix the `isWarm` logic back
pattern_warm = r"const isWarm = l && \(l\.entscheider === 1 \|\| l\.termin === 1 \|\| l\.rechnung === 1 \|\| l\.status === 'Kunde' \|\| l\.status === 'Close'\);"
repl_warm = "const isWarm = l && (l.entscheider === 1 || l.termin === 1 || l.rechnung === 1 || l.status === 'Kunde');"
content = re.sub(pattern_warm, repl_warm, content)

with open('core/db.js', 'w') as f:
    f.write(content)
