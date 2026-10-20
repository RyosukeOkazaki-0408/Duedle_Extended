#!/usr/bin/env python3
"""Stage the bundled user guides and their assets for GitHub Pages."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src' / 'common'
OUTPUT = ROOT / 'build' / 'pages'


def main():
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)
    # Keep the extension sources as the single place to edit the public guides.
    for source in sorted(SOURCE.glob('help*')) + [
        SOURCE / 'install.html', SOURCE / 'support-config.js'
    ]:
        shutil.copy2(source, OUTPUT / source.name)
    shutil.copy2(SOURCE / 'help.html', OUTPUT / 'index.html')
    (OUTPUT / '.nojekyll').touch()
    print(OUTPUT)


if __name__ == '__main__':
    main()
