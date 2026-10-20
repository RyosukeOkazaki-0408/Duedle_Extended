"""Check Xcode resource membership and optionally built apps/xcarchives.

Run after prepare_safari.py --resources-only. Pass app/xcarchive directories to
also check the actual packaged manifest and resources (without modifying them).
"""
from pathlib import Path
import json
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "safari/Duedle/Duedle.xcodeproj/project.pbxproj"
STAGED = ROOT / "safari/build/extension"


def references(manifest):
    result = list(manifest["icons"].values())
    background = manifest.get("background", {})
    if "page" in background:
        result.append(background["page"])
    result.extend(background.get("scripts", []))
    for entry in manifest.get("content_scripts", []):
        result.extend(entry.get("js", []))
        result.extend(entry.get("css", []))
    return result


def exact_file(root, relative):
    current = root
    for part in Path(relative).parts:
        assert current.is_dir() and part in {p.name for p in current.iterdir()}, \
            f"Missing resource or incorrect case: {root / relative}"
        current = current / part
    assert current.is_file(), current
    return current


def check_resources(root):
    manifest = json.loads((root / "manifest.json").read_text())
    for relative in references(manifest):
        exact_file(root, relative)
    for size, relative in manifest["icons"].items():
        data = exact_file(root, relative).read_bytes()
        assert data[:8] == b"\x89PNG\r\n\x1a\n", relative
        assert struct.unpack(">II", data[16:24]) == (int(size), int(size)), relative
        assert data == (ROOT / "src" / relative).read_bytes(), relative
    assert (root / "manifest.json").read_bytes() == (STAGED / "manifest.json").read_bytes(), \
        f"Packaged manifest differs from current Safari staging: {root}"
    print(f"PASS manifest, exact resource paths and four unchanged icons: {root}")


def check_project():
    project = json.loads(subprocess.check_output(
        ["plutil", "-convert", "json", "-o", "-", str(PROJECT)]))
    objects = project["objects"]
    parents = {child: key for key, obj in objects.items() for child in obj.get("children", [])}

    def resolve(key):
        obj = objects[key]
        if obj.get("sourceTree") == "SOURCE_ROOT" or key not in parents:
            base = PROJECT.parent.parent
        else:
            base = resolve(parents[key])
        return (base / obj.get("path", "")).resolve()

    targets = [obj for obj in objects.values() if obj["isa"] == "PBXNativeTarget"
               and obj["name"] in {"Duedle Extension (iOS)", "Duedle Extension (macOS)"}]
    assert len(targets) == 2
    manifest = json.loads((STAGED / "manifest.json").read_text())
    for target in targets:
        copied = []
        for phase_id in target["buildPhases"]:
            phase = objects[phase_id]
            if phase["isa"] != "PBXResourcesBuildPhase":
                continue
            for build_id in phase["files"]:
                ref = objects[build_id]["fileRef"]
                copied.append((resolve(ref), objects[ref].get("lastKnownFileType")))
        assert (STAGED / "manifest.json", "text.json") in copied, target["name"]
        for relative in references(manifest):
            path = STAGED / relative
            assert any(path == source or (kind == "folder" and source in path.parents)
                       for source, kind in copied), f"{target['name']} omits {relative}"
        print(f"PASS Copy Bundle Resources: {target['name']}")


check_resources(STAGED)
check_project()
for argument in sys.argv[1:]:
    directory = Path(argument).resolve()
    manifests = list(directory.rglob("manifest.json"))
    assert manifests, f"No packaged manifest found: {directory}"
    for manifest in manifests:
        check_resources(manifest.parent)
