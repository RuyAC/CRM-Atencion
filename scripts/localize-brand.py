from pathlib import Path
import re

for name in ['src/ui.jsx', 'src/Client.jsx', 'src/Monitor.jsx', 'src/Admin.jsx', 'server/seed.mjs', 'public/manifest.webmanifest', 'public/offline.html', 'PRODUCT.md']:
    path = Path(name)
    source = path.read_text(encoding='utf-8')
    source = source.replace('Jejum mate bar', 'Mate bar').replace('jejum-mate-bar', 'mate-bar').replace('Jejum', 'Mate bar')
    path.write_text(source, encoding='utf-8')
path = Path('server/seed.mjs')
source = path.read_text(encoding='utf-8')
count = 0
def replace_photo(match):
    global count
    count += 1
    return f"imageUrl: '/assets/produto-{count}.jpg'"
source = re.sub(r"imageUrl: photo\('[^']+'\)", replace_photo, source)
path.write_text(source, encoding='utf-8')
