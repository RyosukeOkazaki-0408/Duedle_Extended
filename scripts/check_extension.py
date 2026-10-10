#!/usr/bin/env python3
"""Check shared extension resources, JavaScript syntax, and focused regressions."""

from pathlib import Path
import json
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[1]
JSC = Path("/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc")


def main() -> None:
    manifest = json.loads((ROOT / "src" / "manifest.json").read_text(encoding="utf-8"))
    references = [manifest["background"]["service_worker"]]
    for entry in manifest["content_scripts"]:
        references.extend(entry.get("js", []))
        references.extend(entry.get("css", []))
    missing = [path for path in references if not (ROOT / "src" / path).is_file()]
    if missing:
        raise SystemExit("Missing manifest resources: " + ", ".join(missing))

    javascript = sorted(str(path.relative_to(ROOT)) for path in (ROOT / "src").rglob("*.js"))
    node = shutil.which("node")
    if JSC.is_file():
        subprocess.run([str(JSC), "-e", "for (const path of arguments) new Function(readFile(path));", "--", *javascript], cwd=ROOT, check=True)
        runtime = str(JSC)
    elif node:
        for path in javascript:
            subprocess.run([node, "--check", path], cwd=ROOT, check=True)
        runtime = node
    else:
        raise SystemExit("Install Node.js or run on a Mac with the JavaScriptCore command-line runner.")

    for suite in (
        "tests/safari-regression.js",
        "tests/ui-regression.js",
        "tests/refresh-coordinator-regression.js",
        "tests/auto-refresh-regression.js",
        "tests/auto-refresh-controller-regression.js",
    ):
        subprocess.run([runtime, suite], cwd=ROOT, check=True)
    print(f"Verified {len(references)} manifest references and {len(javascript)} JavaScript files.")


if __name__ == "__main__":
    main()
