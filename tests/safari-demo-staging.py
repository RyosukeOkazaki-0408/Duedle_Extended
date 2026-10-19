"""Check demo isolation and asset updates without copying a native project."""
from pathlib import Path
import importlib.util
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("prepare_safari", ROOT / "scripts/prepare_safari.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)

with tempfile.TemporaryDirectory(prefix="duedle-demo-staging-") as directory:
    root = Path(directory)
    prepare.SOURCE = root / "src"
    prepare.DEMO_SOURCE = root / "demo"
    prepare.DEMO_RESOURCES = root / "build/demo"
    prepare.SOURCE.mkdir()
    prepare.DEMO_SOURCE.mkdir()
    prepare.DEMO_RESOURCES.parent.mkdir()
    page = prepare.DEMO_SOURCE / "index.html"
    page.write_text('<link href="assets/theme.css"><script src="fixtures.js"></script>')
    (prepare.DEMO_SOURCE / "fixtures.js").write_text("const tasks = [];")
    asset = prepare.SOURCE / "theme.css"
    asset.write_text("body { color: black; }")
    (prepare.SOURCE / "unused.js").write_text("Not a demo dependency")
    prepare.stage_demo_resources()
    assert (prepare.DEMO_RESOURCES / "assets/theme.css").read_text() == asset.read_text()
    assert not (prepare.DEMO_RESOURCES / "assets/unused.js").exists()
    assert (prepare.DEMO_RESOURCES / "fixtures.js").read_text() == "const tasks = [];"

    # New UI dependencies and demo files are picked up without project changes.
    asset.write_text("body { color: blue; }")
    (prepare.SOURCE / "feature.js").write_text("const feature = true;")
    page.write_text(page.read_text() + '<script src="assets/feature.js"></script>')
    (prepare.DEMO_SOURCE / "extra.html").write_text("An additional demo screen")
    (prepare.DEMO_RESOURCES / "stale.js").write_text("old generated content")
    prepare.stage_demo_resources()
    assert (prepare.DEMO_RESOURCES / "assets/theme.css").read_text() == asset.read_text()
    assert (prepare.DEMO_RESOURCES / "assets/feature.js").is_file()
    assert (prepare.DEMO_RESOURCES / "extra.html").is_file()
    assert not (prepare.DEMO_RESOURCES / "stale.js").exists()
    assert not (prepare.DEMO_SOURCE / "assets").exists()

    for invalid in ("missing.js", "../private.js"):
        page.write_text(f'<script src="assets/{invalid}"></script>')
        try:
            prepare.stage_demo_resources()
        except SystemExit:
            pass
        else:
            raise AssertionError(f"Invalid dependency accepted: {invalid}")
    assert (prepare.DEMO_RESOURCES / "assets/feature.js").is_file()

print("PASS: demo isolation, current UI assets, new dependencies/files, stale cleanup and invalid references")
