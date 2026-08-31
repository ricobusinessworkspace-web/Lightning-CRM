with open('core/db.js', 'r') as f:
    content = f.read()

pattern = """const isWarm = l && (l.entscheider === 1 || l.termin === 1 || l.rechnung === 1 || l.status === 'Kunde');"""
repl = """const isWarm = l && (l.entscheider === 1 || l.termin === 1 || l.rechnung === 1 || l.status === 'Kunde' || l.status === 'Close');"""

content = content.replace(pattern, repl)

with open('core/db.js', 'w') as f:
    f.write(content)
