"""Verify release ZIP contents using an isolated checkout with local-only files."""
from pathlib import Path
import json
import shutil
import subprocess
import tempfile
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]

with tempfile.TemporaryDirectory(prefix="duedle-package-") as directory:
    checkout = Path(directory) / "checkout"
    checkout.mkdir()
    shutil.copy2(ROOT / "makezip.sh", checkout / "makezip.sh")
    (checkout / "src" / "common").mkdir(parents=True)
    manifest = checkout / "src" / "manifest.json"
    manifest.write_text(json.dumps({"manifest_version": 3, "name": "fixture", "version": "1.0"}))
    asset = checkout / "src" / "common" / "guide with spaces.html"
    asset.write_text("tracked guide")
    (checkout / ".gitignore").write_text(".DS_Store\n.env*\n")
    subprocess.run(["git", "init", "-q", str(checkout)], check=True)
    subprocess.run(["git", "-C", str(checkout), "add", "src"], check=True)
    for relative in ("common/.DS_Store", "common/.env.local", "common/local-notes.txt"):
        (checkout / "src" / relative).write_text("local-only sentinel")
    asset.write_text("current working copy")
    output = Path(directory) / "release.zip"

    def package(destination):
        return subprocess.run(["bash", str(checkout / "makezip.sh"), str(destination)],
                              cwd=directory, capture_output=True, text=True)

    result = package(output)
    assert result.returncode == 0, result.stderr
    with ZipFile(output) as archive:
        assert set(archive.namelist()) == {"manifest.json", "common/guide with spaces.html"}
        assert archive.read("common/guide with spaces.html") == b"current working copy"
        assert all(b"local-only sentinel" not in archive.read(name) for name in archive.namelist())
    assert package(output).returncode != 0, "Existing releases must not be overwritten"

    asset.unlink()
    assert package(Path(directory) / "missing.zip").returncode != 0
    assert not (Path(directory) / "missing.zip").exists()
    external = Path(directory) / "private.txt"
    external.write_text("private sentinel")
    asset.symlink_to(external)
    assert package(Path(directory) / "symlink.zip").returncode != 0
    assert not (Path(directory) / "symlink.zip").exists()

print("PASS packaging: tracked working-copy files only; ignored/untracked files excluded; missing/symlink files and overwrites rejected")
