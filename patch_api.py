with open('core/api.js', 'r') as f:
    content = f.read()

content = content.replace("  getAgentStats: () => db.getAgentStats(),", "  getAgentStats: () => db.getAgentStats(),\n  getLeadHistory: (id) => db.getLeadHistory(id),")

with open('core/api.js', 'w') as f:
    f.write(content)
