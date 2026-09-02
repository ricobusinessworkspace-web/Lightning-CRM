import re
with open('core/db.js', 'r') as f:
    content = f.read()

# 1. ALLOWED_COLUMNS
allowed = r"'name', 'phone', 'notes', 'size', 'entscheider', 'termin', 'rechnung', 'snooze_until_ms',"
new_allowed = "'name', 'phone', 'notes', 'size', 'stage', 'snooze_until_ms',"
content = re.sub(allowed, new_allowed, content)

# 2. Minion Access Control
minion = r"query = query\.or\(`and\(status\.eq\.Lead,entscheider\.eq\.0,termin\.eq\.0,rechnung\.eq\.0\),claimed_by\.eq\.\$\{currentUser\.id\}`\);"
new_minion = "query = query.or(`and(status.eq.Lead,stage.eq.cold),claimed_by.eq.${currentUser.id}`);"
content = re.sub(minion, new_minion, content)

# 3. getStage fallback
get_stage = r"""  getStage: \(lead\) => \{
    if \(lead\.status === 'Uninteressant'\) return 'UNINTERESSANT';
    if \(lead\.stage\) return lead\.stage\.toUpperCase\(\);
    
    // Fallback solange die DB-Migration \(Backfill\) noch nicht durchgelaufen ist
    if \(lead\.status === 'Kunde'\) return 'CLOSED';
    if \(lead\.rechnung === 1\) return 'DATA';
    if \(lead\.termin === 1\) return 'PITCH';
    if \(lead\.entscheider === 1\) return 'PITCH'; // entscheider ist fachlich tot
    return 'COLD';
  \},"""
new_get_stage = """  getStage: (lead) => {
    if (lead.status === 'Uninteressant') return 'UNINTERESSANT';
    if (lead.stage) return lead.stage.toUpperCase();
    if (lead.status === 'Kunde') return 'CLOSED';
    return 'COLD';
  },"""
content = re.sub(get_stage, new_get_stage, content)

# 4. logStatusChange trigger
log_status = r"""        // Determine what advanced status changed
        const pEnt = lead\.entscheider;
        const pTer = lead\.termin;
        const pRech = lead\.rechnung;
        const pStat = lead\.status;
        
        if \(pEnt === 1 && existing\.entscheider !== 1\) await db\.logStatusChange\(lead\.id, 'PITCH'\);
        if \(pTer === 1 && existing\.termin !== 1\) await db\.logStatusChange\(lead\.id, 'FOLLOW-UP'\);
        if \(pRech === 1 && existing\.rechnung !== 1\) await db\.logStatusChange\(lead\.id, 'OFFER'\);
        
        if \(pEnt === 0 && pTer === 0 && pRech === 0 && pStat === 'Lead' && \(existing\.entscheider !== 0 \|\| existing\.termin !== 0 \|\| existing\.rechnung !== 0\)\) \{
          await db\.logStatusChange\(lead\.id, 'COLD'\);
        \}"""

new_log_status = """        // Determine what advanced status changed based on stage
        const oldStage = existing.stage || 'cold';
        const newStage = lead.stage || oldStage;
        
        if (newStage === 'pitch' && oldStage !== 'pitch') await db.logStatusChange(lead.id, 'PITCH');
        if (newStage === 'data' && oldStage !== 'data') await db.logStatusChange(lead.id, 'FOLLOW-UP');
        if (newStage === 'offer' && oldStage !== 'offer') await db.logStatusChange(lead.id, 'OFFER');
        if (newStage === 'cold' && oldStage !== 'cold') await db.logStatusChange(lead.id, 'COLD');
"""
content = re.sub(log_status, new_log_status, content)


with open('core/db.js', 'w') as f:
    f.write(content)
