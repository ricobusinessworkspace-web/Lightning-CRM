import re
with open('core/db.js', 'r') as f:
    content = f.read()

old_log = r"""        if \(pEnt === 1 && existing\.entscheider !== 1\) await db\.logStatusChange\(lead\.id, 'PITCH'\);
        if \(pTer === 1 && existing\.termin !== 1\) await db\.logStatusChange\(lead\.id, 'FOLLOW-UP'\);
        if \(pRech === 1 && existing\.rechnung !== 1\) await db\.logStatusChange\(lead\.id, 'OFFER'\);
        if \(pStat === 'Kunde' && existing\.status !== 'Kunde'\) await db\.logStatusChange\(lead\.id, 'CLOSED'\);
        if \(pEnt === 0 && pTer === 0 && pRech === 0 && pStat === 'Lead' && \(existing\.entscheider !== 0 \|\| existing\.termin !== 0 \|\| existing\.rechnung !== 0\)\) \{
          await db\.logStatusChange\(lead\.id, 'COLD'\);
        \}"""

new_log = """        // Determine what advanced status changed based on stage
        const oldStage = existing.stage || 'cold';
        const newStage = lead.stage || oldStage;
        
        if (newStage === 'pitch' && oldStage !== 'pitch') await db.logStatusChange(lead.id, 'PITCH');
        if (newStage === 'data' && oldStage !== 'data') await db.logStatusChange(lead.id, 'FOLLOW-UP');
        if (newStage === 'offer' && oldStage !== 'offer') await db.logStatusChange(lead.id, 'OFFER');
        if (newStage === 'closed' && oldStage !== 'closed') await db.logStatusChange(lead.id, 'CLOSED');
        if (newStage === 'cold' && oldStage !== 'cold') await db.logStatusChange(lead.id, 'COLD');
"""

content = re.sub(old_log, new_log, content)

# Remove the extraction of pEnt, pTer, pRech
extr = r"""        // Determine what advanced status changed
        const pEnt = lead\.entscheider;
        const pTer = lead\.termin;
        const pRech = lead\.rechnung;
        const pStat = lead\.status;"""
new_extr = "        const pStat = lead.status;"
content = re.sub(extr, new_extr, content)

with open('core/db.js', 'w') as f:
    f.write(content)
