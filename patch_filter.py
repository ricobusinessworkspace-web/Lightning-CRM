with open('public/ui/pipeline_ui.js', 'r') as f:
    content = f.read()

pattern_filter = """         else if (st.advFilterStatus === 'KEEPER') leads = leads.filter(l => l.entscheider && !l.termin && !l.rechnung && l.status !== 'Kunde');
         else if (st.advFilterStatus === 'PITCH') leads = leads.filter(l => l.termin && !l.rechnung && l.status !== 'Kunde');"""

repl_filter = """         else if (st.advFilterStatus === 'PITCH') leads = leads.filter(l => l.entscheider && !l.termin && !l.rechnung && l.status !== 'Kunde');
         else if (st.advFilterStatus === 'FOLLOWUP') leads = leads.filter(l => l.termin && !l.rechnung && l.status !== 'Kunde');"""

if pattern_filter in content:
    content = content.replace(pattern_filter, repl_filter)

pattern_opts = """            <option value="KEEPER" ${st.advFilterStatus === 'KEEPER' ? 'selected' : ''}>KEEPER</option>
            <option value="PITCH" ${st.advFilterStatus === 'PITCH' ? 'selected' : ''}>PITCH</option>
            <option value="OFFER" ${st.advFilterStatus === 'OFFER' ? 'selected' : ''}>OFFER</option>
            <option value="CLOSE" ${st.advFilterStatus === 'CLOSE' ? 'selected' : ''}>CLOSE</option>"""

repl_opts = """            <option value="PITCH" ${st.advFilterStatus === 'PITCH' ? 'selected' : ''}>PITCH</option>
            <option value="FOLLOWUP" ${st.advFilterStatus === 'FOLLOWUP' ? 'selected' : ''}>FOLLOW-UP</option>
            <option value="OFFER" ${st.advFilterStatus === 'OFFER' ? 'selected' : ''}>OFFER</option>
            <option value="CLOSE" ${st.advFilterStatus === 'CLOSE' ? 'selected' : ''}>CLOSE</option>"""

if pattern_opts in content:
    content = content.replace(pattern_opts, repl_opts)

with open('public/ui/pipeline_ui.js', 'w') as f:
    f.write(content)
