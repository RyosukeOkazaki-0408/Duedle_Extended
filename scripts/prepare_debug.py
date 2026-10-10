#!/usr/bin/env python3
"""Build an isolated, offline developer extension. Load build/debug in Chrome."""
from pathlib import Path
import json
import shutil
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'build' / 'debug'
def main():
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(ROOT / 'src', OUTPUT)
    shutil.copytree(ROOT / 'dev', OUTPUT / 'dev')
    manifest = json.loads((OUTPUT / 'manifest.json').read_text())
    manifest.update(name='Duedle 開発用（ダミー専用）', permissions=['storage'], host_permissions=[], content_scripts=[],
        background={'service_worker': 'dev/background.js'}, options_page='dev/index.html',
        content_security_policy={'extension_pages': "script-src 'self'; object-src 'none'; connect-src 'none'; img-src 'self' data:; form-action 'none'"})
    (OUTPUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    print(OUTPUT)
if __name__ == '__main__': main()
