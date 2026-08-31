with open('core/db.js', 'r') as f:
    content = f.read()

pattern = """      // Check for status changes
      if (existing) {
        if (payload.entscheider === 1 && existing.entscheider !== 1) await window.api.logStatusChange(lead.id, 'KEEPER');
        if (payload.termin === 1 && existing.termin !== 1) await window.api.logStatusChange(lead.id, 'PITCH');
        if (payload.rechnung === 1 && existing.rechnung !== 1) await window.api.logStatusChange(lead.id, 'OFFER');
        if (payload.status === 'Kunde' && existing.status !== 'Kunde') await window.api.logStatusChange(lead.id, 'CLOSE');
      }"""

repl = """      // Check for status changes
      if (existing) {
        try {
          if (payload.entscheider === 1 && existing.entscheider !== 1) await window.api.logStatusChange(lead.id, 'PITCH');
          if (payload.termin === 1 && existing.termin !== 1) await window.api.logStatusChange(lead.id, 'FOLLOW-UP');
          if (payload.rechnung === 1 && existing.rechnung !== 1) await window.api.logStatusChange(lead.id, 'OFFER');
          if (payload.status === 'Kunde' && existing.status !== 'Kunde') await window.api.logStatusChange(lead.id, 'CLOSE');
          if (payload.entscheider === 0 && payload.termin === 0 && payload.rechnung === 0 && payload.status === 'Lead' && (existing.entscheider !== 0 || existing.termin !== 0 || existing.rechnung !== 0)) {
            await window.api.logStatusChange(lead.id, 'COLD');
          }
        } catch(e) {
          console.warn('Could not log status change (maybe lead_activities table is missing)', e);
        }
      }"""

if pattern in content:
    content = content.replace(pattern, repl)
else:
    print("Pattern not found in db.js!")

with open('core/db.js', 'w') as f:
    f.write(content)
