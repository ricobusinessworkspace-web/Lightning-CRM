import re

with open('core/db.js', 'r') as f:
    content = f.read()

new_getAgentStats = """  getAgentStats: async () => {
    if (!currentUser) throw new Error("Keine Berechtigung");
    
    const { data: users, error: userErr } = await supabase.from('user_profiles').select('id, name, role, daily_call_goal');
    if (userErr) throw new Error(userErr.message);
    
    let stats = {};
    users.forEach(u => {
      stats[u.id] = { 
        id: u.id, name: u.name, role: u.role, daily_call_goal: u.daily_call_goal || 100,
        today: { calls: 0, unanswered: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 },
        week: { calls: 0, unanswered: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 },
        total: { calls: 0, unanswered: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 }
      };
    });

    if (!stats[currentUser.id]) {
      stats[currentUser.id] = {
        id: currentUser.id, name: currentUser.name, role: currentUser.role, daily_call_goal: currentUser.daily_call_goal || 100,
        today: { calls: 0, unanswered: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 },
        week: { calls: 0, unanswered: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 },
        total: { calls: 0, unanswered: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 }
      }
    }
    
    const { data: leads, error } = await supabase.from(TABLE).select('claimed_by, created_at_ms');
    if (error) throw new Error(error.message);

    const { data: allCalls } = await supabase.from('crm_calls').select('by_user_id, ts, status, crm_leads!inner(entscheider, termin, rechnung, status, size)');
    const { data: allActs } = await supabase.from('lead_activities').select('by_user_id, ts, type, details');

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    const dayOfWeek = now.getDay();
    const diffToMonday = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diffToMonday).getTime();
    
    for (const row of (leads || [])) {
      if (row.claimed_by && stats[row.claimed_by]) {
        stats[row.claimed_by].total.leads++;
        if (row.created_at_ms >= startOfDay) stats[row.claimed_by].today.leads++;
        if (row.created_at_ms >= startOfWeek) stats[row.claimed_by].week.leads++;
      }
    }

    for (const call of (allCalls || [])) {
      if (call.by_user_id && stats[call.by_user_id]) {
        const isToday = call.ts >= startOfDay;
        const isWeek = call.ts >= startOfWeek;
        const l = call.crm_leads;
        const isWarm = l && (l.entscheider === 1 || l.termin === 1 || l.rechnung === 1 || l.status === 'Kunde');
        const isGross = l && l.size === 'Großkunde';

        stats[call.by_user_id].total.calls++;
        if (isToday) {
          stats[call.by_user_id].today.calls++;
          if (isWarm) stats[call.by_user_id].today.warm++;
          else if (isGross) stats[call.by_user_id].today.cold_gross++;
          else stats[call.by_user_id].today.cold_tarif++;
        }
        if (isWeek) {
          stats[call.by_user_id].week.calls++;
          if (isWarm) stats[call.by_user_id].week.warm++;
          else if (isGross) stats[call.by_user_id].week.cold_gross++;
          else stats[call.by_user_id].week.cold_tarif++;
        }

        if (call.status === 'not_answered') {
          stats[call.by_user_id].total.unanswered++;
          if (isToday) stats[call.by_user_id].today.unanswered++;
          if (isWeek) stats[call.by_user_id].week.unanswered++;
        }
      }
    }
    
    for (const act of (allActs || [])) {
      if (act.by_user_id && stats[act.by_user_id]) {
        const isToday = act.ts >= startOfDay;
        const isWeek = act.ts >= startOfWeek;
        
        if (act.type === 'email') {
          stats[act.by_user_id].total.emails++;
          if (isToday) stats[act.by_user_id].today.emails++;
          if (isWeek) stats[act.by_user_id].week.emails++;
        } else if (act.type === 'status_change' && (act.details || '').includes('OFFER')) {
          stats[act.by_user_id].total.offers++;
          if (isToday) stats[act.by_user_id].today.offers++;
          if (isWeek) stats[act.by_user_id].week.offers++;
        }
      }
    }
    return Object.values(stats);
  },"""

# Use regex to find getAgentStats and replace it entirely
pattern = r"  getAgentStats: async \(\) => \{.*?(?=  getUserRP:)"
new_content = re.sub(pattern, new_getAgentStats + "\n", content, flags=re.DOTALL)

with open('core/db.js', 'w') as f:
    f.write(new_content)
