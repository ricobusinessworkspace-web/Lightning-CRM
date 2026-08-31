with open('theme.css', 'r') as f:
    content = f.read()

import re

# Replace the specific CRM color variables
content = re.sub(r"--color-crm-cold:\s*var\(--color-intent-muted\);", "--color-crm-cold: #0a84ff; /* COLD: Blue */", content)
content = re.sub(r"--color-crm-decision:\s*var\(--color-intent-info\);", "--color-crm-decision: #ff9f0a; /* PITCH: Orange */", content)
content = re.sub(r"--color-crm-appointment:\s*var\(--color-intent-warning\);", "--color-crm-appointment: #ff453a; /* DATA: Orange-Red */", content)
content = re.sub(r"--color-crm-invoice:\s*var\(--color-intent-danger\);", "--color-crm-invoice: #d70015; /* OFFER: Red */", content)
# Make CLOSE deep red? Wait, CLOSE is currently not a separate DB field. It's just the pipeline column for KUNDE!
# "CLOSE können wir auch beibehalten. Das steht auch in der Pipeline... Und dann gibt's natürlich noch den letzten Status und der ist einfach nur KUNDE."
# This implies CLOSE is a status.
with open('theme.css', 'w') as f:
    f.write(content)
