import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Donut chart SVG labels
content = re.sub(r'font-size="17"\s+font-weight="800"', 'font-size="19" font-weight="800"', content)
content = re.sub(r'font-size="16"\s+font-weight="700"', 'font-size="18" font-weight="800"', content)
content = re.sub(r'font-size="34"\s+font-weight="700"', 'font-size="38" font-weight="800"', content)
content = re.sub(r'font-size="13"\s+font-weight="600" text-anchor="middle"', 'font-size="15" font-weight="700" text-anchor="middle"', content)

# 2. Stats log items inline styles (Monthly, Yearly, All-Time)
# Type badges
content = re.sub(
    r'padding: 4px 12px;\s*border-radius: 9999px;\s*font-size: 12px;\s*font-weight: 600;',
    'padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600;',
    content
)

# Item main titles
content = re.sub(
    r'font-weight: 600;\s*font-size: 13px;',
    'font-weight: 700; font-size: 15px;',
    content
)

# Item subtext/note/date
content = re.sub(
    r'font-size: 11px;\s*color: var\(--text-secondary\);',
    'font-size: 13px; color: var(--text-secondary);',
    content
)

content = re.sub(
    r'font-size: 12px;\s*color: var\(--text-secondary\);',
    'font-size: 13px; color: var(--text-secondary);',
    content
)

# Prices / amounts
content = re.sub(
    r'font-weight: 600;\s*font-size: 13px;\s*color: #715a57;',
    'font-weight: 700; font-size: 16px; color: #715a57;',
    content
)

content = re.sub(
    r'font-weight: 600;\s*font-size: 14px;\s*color: #715a57;',
    'font-weight: 700; font-size: 16px; color: #715a57;',
    content
)

content = re.sub(
    r'font-weight: 700;\s*font-size: 14px;\s*color: #715a57;',
    'font-weight: 700; font-size: 16px; color: #715a57;',
    content
)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated app.js font sizes successfully!')
