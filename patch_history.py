with open('core/db.js', 'r') as f:
    content = f.read()

new_method = """
  getLeadHistory: async (leadId) => {
    const { data: calls, error: err1 } = await supabase.from('crm_calls').select('*').eq('lead_id', leadId).order('ts', { ascending: true });
    const { data: acts, error: err2 } = await supabase.from('lead_activities').select('*').eq('lead_id', leadId).order('ts', { ascending: true });
    
    if (err1 || err2) {
      console.warn('Failed to fetch full history', err1 || err2);
      return { crm_calls: [], lead_activities: [] };
    }
    
    return { crm_calls: calls || [], lead_activities: acts || [] };
  },
  
  saveLead: async (lead) => {"""

content = content.replace("  saveLead: async (lead) => {", new_method)

with open('core/db.js', 'w') as f:
    f.write(content)
