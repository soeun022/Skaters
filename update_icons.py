import base64
import re

with open('favicon-32.png', 'rb') as f:
    b64_32 = base64.b64encode(f.read()).decode('utf-8')

with open('favicon-64.png', 'rb') as f:
    b64_64 = base64.b64encode(f.read()).decode('utf-8')

with open('favicon-128.png', 'rb') as f:
    b64_128 = base64.b64encode(f.read()).decode('utf-8')

head_icons = f'''    <!-- App Icons (iOS Squircle & Base64 Favicon) -->
    <link rel="icon" type="image/svg+xml" href="favicon-rounded.svg?v=4">
    <link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,{b64_32}">
    <link rel="icon" type="image/png" sizes="64x64" href="data:image/png;base64,{b64_64}">
    <link rel="shortcut icon" type="image/png" href="data:image/png;base64,{b64_32}">
    <link rel="apple-touch-icon" sizes="128x128" href="data:image/png;base64,{b64_128}">
    <link rel="icon" type="image/png" href="favicon-32.png?v=4">
    <link rel="icon" type="image/png" href="favicon-64.png?v=4">
    <link rel="apple-touch-icon" href="favicon-128.png?v=4">'''

for fname in ['index.html']:
    with open(fname, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = re.sub(
        r'<!-- App Icons.*?-->\s*(<link[^>]+>\s*)+',
        head_icons + '\n',
        content,
        flags=re.DOTALL
    )

    with open(fname, 'w', encoding='utf-8') as f:
        f.write(new_content)

print('Updated head icons with iOS squircle SVG and Base64 successfully!')
