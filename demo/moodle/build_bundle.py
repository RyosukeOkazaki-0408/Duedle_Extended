#!/usr/bin/env python3
"""Package only the demo installer and its resources for upload to the demo VM."""
from pathlib import Path
import tarfile
import shutil

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parents[1] / 'build' / 'demo' / 'duedle-moodle-demo.tar.gz'

def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(OUTPUT, 'w:gz') as archive:
        for name in ('setup.sh', 'seed.php', 'finish_install.php', 'README.md', 'plugins', 'routes', 'files'):
            archive.add(ROOT / name, arcname='duedle-moodle-demo/' + name)
    # Distinguish the recovery upload from an old same-named file on the VM.
    shutil.copyfile(OUTPUT, OUTPUT.with_name('duedle-moodle-demo-recovery-20261026-1.tar.gz'))
    print(OUTPUT)

if __name__ == '__main__':
    main()
