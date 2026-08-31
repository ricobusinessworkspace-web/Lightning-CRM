with open('core/db.js', 'r') as f:
    content = f.read()

pattern = """      // Tab specific base status
      if (filters.tab === 'queue') {
        if (filters.filter1 !== 'kunden') {
          query = query.eq('status', 'Lead');
        }"""
repl = """      // Tab specific base status
      if (filters.tab === 'queue') {
        if (filters.filter1 !== 'kunden') {
          query = query.in('status', ['Lead', 'Close']);
        }"""
content = content.replace(pattern, repl)

# Also update the catch block where logStatusChange is called
log_pattern = """          if (payload.status === 'Kunde' && existing.status !== 'Kunde') await window.api.logStatusChange(lead.id, 'CLOSE');"""
log_repl = """          if (payload.status === 'Close' && existing.status !== 'Close') await window.api.logStatusChange(lead.id, 'CLOSE');
          if (payload.status === 'Kunde' && existing.status !== 'Kunde') await window.api.logStatusChange(lead.id, 'KUNDE');"""
content = content.replace(log_pattern, log_repl)

with open('core/db.js', 'w') as f:
    f.write(content)
