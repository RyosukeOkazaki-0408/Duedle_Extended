#!/usr/bin/env python3
"""Stage shared Web Extension resources and create the Safari host project."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src"
SAFARI = ROOT / "safari"
RESOURCES = SAFARI / "build" / "extension"
PROJECT = SAFARI / "Duedle" / "Duedle.xcodeproj"


def stage_resources() -> None:
    """Keep src as the only maintained extension source, with a Safari manifest."""
    manifest = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    manifest.pop("$schema", None)
    manifest["permissions"] = [
        permission
        for permission in manifest.get("permissions", [])
        if permission not in {"offscreen", "notifications"}
    ]
    # Manifest V3 backgrounds are automatically nonpersistent in Safari.
    # The background page centralizes storage and tab-based collection.
    # Moodle refreshes run in a content script using the signed-in site's session.
    manifest["background"] = {
        "page": "storage/background.html",
    }
    referenced_files = [manifest["background"]["page"]]
    for content_script in manifest.get("content_scripts", []):
        referenced_files.extend(content_script.get("js", []))
        referenced_files.extend(content_script.get("css", []))
    referenced_files.extend(manifest.get("icons", {}).values())
    missing = [path for path in referenced_files if not (SOURCE / path).is_file()]
    if missing:
        raise SystemExit("Missing Web Extension resource(s): " + ", ".join(missing))

    RESOURCES.parent.mkdir(parents=True, exist_ok=True)
    if RESOURCES.exists():
        shutil.rmtree(RESOURCES)
    shutil.copytree(
        SOURCE,
        RESOURCES,
        ignore=shutil.ignore_patterns(".DS_Store", "*.ts", "*.map", "dev", "debug"),
    )
    (RESOURCES / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def create_project() -> None:
    subprocess.run(
        [
            "xcrun",
            "safari-web-extension-packager",
            str(RESOURCES),
            "--project-location",
            str(SAFARI),
            "--app-name",
            "Duedle",
            "--bundle-identifier",
            "app.duedle.safari",
            "--swift",
            "--no-open",
            "--no-prompt",
            "--force",
        ],
        check=True,
    )
    configure_project()


def configure_project() -> None:
    """Normalize the generated host without account-specific signing settings."""
    project_file = PROJECT / "project.pbxproj"
    project_text = project_file.read_text(encoding="utf-8")
    # The packager uses relative resource references, preserving clone portability.
    # Safari 16 is available on macOS 13 and iOS/iPadOS 16.
    project_text = re.sub(
        r"IPHONEOS_DEPLOYMENT_TARGET = [^;]+;",
        "IPHONEOS_DEPLOYMENT_TARGET = 16.0;",
        project_text,
    )
    manifest = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    project_text = re.sub(
        r"MARKETING_VERSION = [^;]+;",
        f'MARKETING_VERSION = {manifest["version"]};',
        project_text,
    )
    project_text = re.sub(
        r"MACOSX_DEPLOYMENT_TARGET = [^;]+;",
        "MACOSX_DEPLOYMENT_TARGET = 13.0;",
        project_text,
    )
    project_file.write_text(project_text, encoding="utf-8")

    host_resources = PROJECT.parent / "Shared (App)" / "Resources"
    html_file = host_resources / "Base.lproj" / "Main.html"
    html_text = html_file.read_text(encoding="utf-8")
    replacements = {
        "<html>": '<html lang="ja">',
        "width=device-width, initial-scale=1, user-scalable=no": "width=device-width, initial-scale=1",
        "You can turn on Duedle’s Safari extension in Settings.": "設定アプリで Safari の「拡張機能」を開き、Duedle をオンにしてください。Moodle を開き、拡張機能にサイトへのアクセスを許可してください。",
        "You can turn on Duedle’s extension in Safari Extensions preferences.": "Safari の「設定」→「機能拡張」で Duedle をオンにしてください。Moodle を開き、拡張機能にサイトへのアクセスを許可してください。",
        "Duedle’s extension is currently on. You can turn it off in Safari Extensions preferences.": "Duedle は有効です。Safari で Moodle を開き、サイトへのアクセスを許可してください。",
        "Duedle’s extension is currently off. You can turn it on in Safari Extensions preferences.": "Duedle は無効です。Safari の「設定」→「機能拡張」でオンにしてください。",
        "Quit and Open Safari Extensions Preferences…": "Safari の機能拡張設定を開く",
    }
    for old, new in replacements.items():
        html_text = html_text.replace(old, new)
    html_file.write_text(html_text, encoding="utf-8")

    script_file = host_resources / "Script.js"
    script_text = script_file.read_text(encoding="utf-8")
    script_replacements = {
        "Duedle’s extension is currently on. You can turn it off in the Extensions section of Safari Settings.": "Duedle は有効です。Safari で Moodle を開き、サイトへのアクセスを許可してください。",
        "Duedle’s extension is currently off. You can turn it on in the Extensions section of Safari Settings.": "Duedle は無効です。Safari の「設定」→「機能拡張」でオンにしてください。",
        "You can turn on Duedle’s extension in the Extensions section of Safari Settings.": "Safari の「設定」→「機能拡張」で Duedle をオンにしてください。",
        "Quit and Open Safari Settings…": "Safari の機能拡張設定を開く",
    }
    for old, new in script_replacements.items():
        script_text = script_text.replace(old, new)
    script_file.write_text(script_text, encoding="utf-8")

    view_controller = PROJECT.parent / "Shared (App)" / "ViewController.swift"
    view_text = view_controller.read_text(encoding="utf-8").replace(
        "self.webView.scrollView.isScrollEnabled = false",
        "self.webView.scrollView.isScrollEnabled = true",
    )
    view_controller.write_text(view_text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--regenerate-project",
        action="store_true",
        help="Recreate the generated Xcode host project, replacing local native edits.",
    )
    parser.add_argument(
        "--resources-only",
        action="store_true",
        help="Only refresh the extension resources, without invoking Xcode's packager.",
    )
    args = parser.parse_args()
    stage_resources()
    if not args.resources_only and (args.regenerate_project or not PROJECT.exists()):
        create_project()
    elif not args.resources_only and PROJECT.exists():
        configure_project()
    print(f"Safari resources: {RESOURCES.relative_to(ROOT)}")
    if PROJECT.exists():
        print(f"Xcode project: {PROJECT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
