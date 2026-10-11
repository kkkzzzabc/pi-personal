#!/usr/bin/env python3
"""
fetch-references — Clone the reference repositories listed in references.json

Each entry is cloned into .references/<kind>/<owner>/<repo>. Existing
checkouts are left untouched unless --update is given. New clones are
shallow (--depth 1); entries with "sparse" check out only those paths.

Examples:
  python3 scripts/fetch-references.py                 # clone missing repos
  python3 scripts/fetch-references.py --kind customizations
  python3 scripts/fetch-references.py --update        # pull existing repos
  python3 scripts/fetch-references.py --list          # show status only
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "references.json"
REFS = ROOT / ".references"


def git(*args: str, cwd: Path | None = None) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    )
    return result.stdout.strip()


def target(entry: dict) -> Path:
    return REFS / entry["kind"] / entry["repo"]


def clone(entry: dict, dest: Path) -> None:
    url = entry.get("url", f"https://github.com/{entry['repo']}.git")
    dest.parent.mkdir(parents=True, exist_ok=True)
    sparse = entry.get("sparse")
    if sparse:
        git("clone", "--depth", "1", "--filter=blob:none", "--sparse", url, str(dest))
        git("sparse-checkout", "set", *sparse, cwd=dest)
    else:
        git("clone", "--depth", "1", url, str(dest))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--kind", help="Only process entries of this kind")
    parser.add_argument("--update", action="store_true", help="Pull existing checkouts")
    parser.add_argument("--list", action="store_true", help="Print status without changes")
    args = parser.parse_args()

    entries = json.loads(MANIFEST.read_text())["references"]
    if args.kind:
        entries = [e for e in entries if e["kind"] == args.kind]

    failed = 0
    for entry in entries:
        dest = target(entry)
        rel = dest.relative_to(ROOT)
        try:
            if dest.exists():
                if args.update and not args.list:
                    git("pull", "--ff-only", cwd=dest)
                head = git("rev-parse", "--short", "HEAD", cwd=dest)
                print(f"ok      {rel} @ {head}")
            elif args.list:
                print(f"missing {rel}")
            else:
                clone(entry, dest)
                head = git("rev-parse", "--short", "HEAD", cwd=dest)
                print(f"cloned  {rel} @ {head}")
        except subprocess.CalledProcessError as err:
            failed += 1
            print(f"error   {rel}: {err.stderr.strip()}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
