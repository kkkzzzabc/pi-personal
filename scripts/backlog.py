#!/usr/bin/env python3
"""List and create project backlog items stored as one file per item.

Items live in docs/backlog/<ID>-<slug>.md with a small frontmatter block
(id, title, status, kind). Usage:

  python3 scripts/backlog.py list [--status STATUS[,STATUS...]] [--all]
  python3 scripts/backlog.py new "<title>" --kind KIND [--status STATUS]

`list` hides done and dropped items unless --all or --status selects them.
`new` creates an item with a random ID that does not collide with existing IDs.
"""

import argparse
import pathlib
import re
import secrets
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKLOG = ROOT / "docs" / "backlog"
TEMPLATE = ROOT / "docs" / "templates" / "backlog-item.md"
STATUSES = ["active", "next", "blocked", "candidate", "done", "dropped"]
CLOSED = {"done", "dropped"}
ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o/1/l/i


def read_item(path):
    text = path.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not match:
        return None
    fields = {}
    for line in match.group(1).splitlines():
        key, sep, value = line.partition(":")
        if sep:
            fields[key.strip()] = value.strip()
    fields["path"] = path
    return fields


def load_items():
    items = [read_item(path) for path in sorted(BACKLOG.glob("*.md")) if path.name != "README.md"]
    return [item for item in items if item]


def cmd_list(args):
    items = load_items()
    if args.status:
        wanted = set(args.status.split(","))
    elif args.all:
        wanted = set(STATUSES)
    else:
        wanted = set(STATUSES) - CLOSED
    seen = set()
    for item in items:
        if item.get("id") in seen:
            print(f"warning: duplicate id {item.get('id')} in {item['path'].name}", file=sys.stderr)
        seen.add(item.get("id"))
        if item.get("status") not in STATUSES:
            print(f"warning: unknown status {item.get('status')!r} in {item['path'].name}", file=sys.stderr)
    for status in STATUSES:
        group = [item for item in items if item.get("status") == status and status in wanted]
        if not group:
            continue
        print(f"## {status}")
        for item in group:
            rel = item["path"].relative_to(ROOT)
            print(f"- {item.get('id')} [{item.get('kind', '?')}] {item.get('title', '')}  ({rel})")
        print()


def cmd_new(args):
    if args.status not in STATUSES:
        sys.exit(f"error: status must be one of {', '.join(STATUSES)}")
    existing = {item.get("id") for item in load_items()}
    while True:
        item_id = "BL-" + "".join(secrets.choice(ID_ALPHABET) for _ in range(4))
        if item_id not in existing:
            break
    slug = "-".join(re.sub(r"[^a-z0-9]+", "-", args.title.lower()).strip("-").split("-")[:6])
    path = BACKLOG / f"{item_id}-{slug}.md"
    text = TEMPLATE.read_text(encoding="utf-8")
    text = re.sub(r"<!--.*?-->\n\n?", "", text, flags=re.S)
    for key, value in {"id": item_id, "title": args.title, "status": args.status, "kind": args.kind}.items():
        text = text.replace(f"<{key}>", value)
    path.write_text(text, encoding="utf-8")
    print(path.relative_to(ROOT))


def main():
    parser = argparse.ArgumentParser(description="Project backlog items (docs/backlog/).")
    sub = parser.add_subparsers(dest="command", required=True)
    p_list = sub.add_parser("list", help="list items grouped by status")
    p_list.add_argument("--status", help="comma-separated statuses to show")
    p_list.add_argument("--all", action="store_true", help="include done and dropped items")
    p_list.set_defaults(func=cmd_list)
    p_new = sub.add_parser("new", help="create an item with a random ID")
    p_new.add_argument("title")
    p_new.add_argument("--kind", required=True, help="Research, Spike, Design, Implementation, or Documentation")
    p_new.add_argument("--status", default="candidate")
    p_new.set_defaults(func=cmd_new)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
