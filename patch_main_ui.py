import re
with open('public/ui/main_ui.js', 'r') as f:
    content = f.read()

# 1. Fix setPipeline
old_set_pipeline = r"""window\.setPipeline = async \(type\) => \{
    let t = parseInt\(document\.getElementById\('sys-t'\)\.value\) \|\| 0;
    let r = parseInt\(document\.getElementById\('sys-r'\)\.value\) \|\| 0;
    let k = parseInt\(document\.getElementById\('sys-k'\)\.value\) \|\| 0;
    let stage = document\.getElementById\('sys-stage'\)\.value \|\| 'cold';

    if \(type === 'cold'\) \{
       t = 0; r = 0; k = 0; stage = 'cold';
    \}
    if \(type === 'pitch'\) \{
       t = t \? 0 : 1;
       if \(t\) \{ stage = 'pitch'; \}
       if \(t === 0\) \{ r = 0; k = 0; stage = 'cold'; \}
    \}
    if \(type === 'data'\) \{
       r = r \? 0 : 1;
       if \(r\) \{ t = 1; stage = 'data'; \}
       if \(r === 0\) \{ k = 0; stage = 'pitch'; \}
    \}
    if \(type === 'offer'\) \{
       // OFFER is a new stage\. In the booleans, we can't reflect it except by setting rechnung=1\.
       // The DB expects stage='offer' and rechnung=1\.
       if \(stage === 'offer'\) \{
          stage = 'data'; // rollback to data
          k = 0;
       \} else \{
          stage = 'offer';
          t = 1; r = 1;
       \}
    \}
    if \(type === 'closed'\) \{
       k = k \? 0 : 1;
       if \(k\) \{ t = 1; r = 1; stage = 'closed'; \}
       if \(k === 0\) \{ stage = 'offer'; \}
    \}

    if \(document\.getElementById\('sys-t'\)\) document\.getElementById\('sys-t'\)\.value = t;
    if \(document\.getElementById\('sys-r'\)\) document\.getElementById\('sys-r'\)\.value = r;
    if \(document\.getElementById\('sys-k'\)\) document\.getElementById\('sys-k'\)\.value = k;
    if \(document\.getElementById\('sys-stage'\)\) document\.getElementById\('sys-stage'\)\.value = stage;"""

new_set_pipeline = """window.setPipeline = async (type) => {
    let k = parseInt(document.getElementById('sys-k').value) || 0;
    let stage = document.getElementById('sys-stage').value || 'cold';

    if (type === 'cold') {
       k = 0; stage = 'cold';
    } else if (type === 'pitch') {
       stage = (stage === 'pitch') ? 'cold' : 'pitch';
       if (stage === 'cold') k = 0;
    } else if (type === 'data') {
       stage = (stage === 'data') ? 'pitch' : 'data';
       if (stage === 'pitch') k = 0;
    } else if (type === 'offer') {
       stage = (stage === 'offer') ? 'data' : 'offer';
       if (stage === 'data') k = 0;
    } else if (type === 'closed') {
       k = k ? 0 : 1;
       stage = k ? 'closed' : 'offer';
    }

    if (document.getElementById('sys-k')) document.getElementById('sys-k').value = k;
    if (document.getElementById('sys-stage')) document.getElementById('sys-stage').value = stage;"""

content = re.sub(old_set_pipeline, new_set_pipeline, content)

# 2. Fix saveLeadMain
# Remove entscheider, termin, rechnung parsing
save_parse = r"""      let entscheider = parseInt\(document\.getElementById\('sys-e'\)\?\.value\) \|\| 0;
      let stage = document\.getElementById\('sys-stage'\)\?\.value \|\| 'cold';
      let termin = parseInt\(document\.getElementById\('sys-t'\)\?\.value\) \|\| 0;
      let rechnung = parseInt\(document\.getElementById\('sys-r'\)\?\.value\) \|\| 0;
      let isKundeVal = parseInt\(document\.getElementById\('sys-k'\)\?\.value\) \|\| 0;"""

new_save_parse = """      let stage = document.getElementById('sys-stage')?.value || 'cold';
      let isKundeVal = parseInt(document.getElementById('sys-k')?.value) || 0;"""
content = re.sub(save_parse, new_save_parse, content)

# Remove from API save call
api_save = r"""        notes, entscheider, termin, rechnung, size, snooze_until_ms: snoozeMs, 
        task_text: taskTxt, status: status, maps_city: city, lat, lng, """
new_api_save = """        notes, stage: stage, size, snooze_until_ms: snoozeMs, 
        task_text: taskTxt, status: status, maps_city: city, lat, lng, """
content = re.sub(api_save, new_api_save, content)

# Remove from store patch
store_patch = r"""            notes, entscheider, termin, rechnung, size,
            status: status, maps_city: city,
            starred: isStarred"""
new_store_patch = """            notes, stage: stage, size,
            status: status, maps_city: city,
            starred: isStarred"""
content = re.sub(store_patch, new_store_patch, content)

# Dashboard stats fetching
stats_fetch = r"""      document\.getElementById\('stat-ent'\)\.innerText = stats\.entscheider \|\| 0;
      document\.getElementById\('stat-term'\)\.innerText = stats\.termin \|\| 0;"""
new_stats_fetch = """      document.getElementById('stat-ent').innerText = stats.pitch || 0;
      document.getElementById('stat-term').innerText = stats.data || 0;"""
content = re.sub(stats_fetch, new_stats_fetch, content)


with open('public/ui/main_ui.js', 'w') as f:
    f.write(content)
