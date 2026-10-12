#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"

# Package current contents of tracked source files, never local/untracked files.
python3 - "$@" <<'PY'
from datetime import datetime
from pathlib import Path
import subprocess
import sys
from zipfile import ZipFile, ZIP_DEFLATED

if len(sys.argv) > 2:
    raise SystemExit("Usage: makezip.sh [output.zip]")

source = Path("src")
tracked = subprocess.check_output(["git", "ls-files", "--cached", "-z", "--", "src/"])
files = [Path(name.decode()) for name in tracked.split(b"\0") if name]
if not files or source / "manifest.json" not in files:
    raise SystemExit("No tracked extension manifest; run this script from a Git checkout.")

for path in files:
    if path.is_symlink() or not path.is_file():
        raise SystemExit(f"Cannot package missing, non-regular or symlink source: {path}")

output = Path(sys.argv[1]) if len(sys.argv) == 2 else Path("dist") / (datetime.now().strftime("%Y%m%d-%H%M%S-%f") + ".zip")
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, "x", compression=ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, path.relative_to(source).as_posix())
print(output.resolve())
PY
