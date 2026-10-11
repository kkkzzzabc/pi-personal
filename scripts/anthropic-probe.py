#!/usr/bin/env python3
"""
anthropic-probe — Recheck Anthropic third-party request blocking

Send a minimal request using the same Claude Code-style headers as pi
(user-agent: claude-cli/..., x-app: cli,
anthropic-beta: claude-code-20250219,oauth-2025-04-20). Inspect whether the
response is 400 ("Third-party apps now draw from your extra usage") or 200,
and report the unified plan rate-limit headers.

Examples:
  python3 scripts/anthropic-probe.py --preset neutral
  python3 scripts/anthropic-probe.py --preset pi-full --payload /tmp/pi_req.log
  python3 scripts/anthropic-probe.py --text "Text for the second system block"
  python3 scripts/anthropic-probe.py --file /tmp/sys2.txt --model claude-haiku-5-5
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request

CC = "You are Claude Code, Anthropic's official CLI for Claude."
ASIDE_PREAMBLE = (
    "You are an expert coding assistant operating inside Aside, an AI browser. "
    "You help users by reading files, executing commands, editing code, writing new files, and using the browser."
)
NEUTRAL = (
    "Host-tool documentation is not bundled in this prompt. "
    "When the user asks about the host tool itself, locate and read its README and docs "
    "from the installed package before answering."
)
HEADERS = {
    "anthropic-version": "2023-06-01",
    "user-agent": "claude-cli/2.1.280",
    "x-app": "cli",
    "content-type": "application/json",
    "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
}
URL = "https://api.anthropic.com/v1/messages"


def load_token(source: str) -> str:
    if source.startswith("env:"):
        value = os.environ.get(source[4:])
        if not value:
            sys.exit(f"Environment variable {source[4:]} is missing or empty.")
        return value
    if source == "aside":
        path = os.path.expanduser("~/.aside/u/0/credentials.json")
        return json.load(open(path))["claude-code"]["access"]
    path = os.path.expanduser("~/.pi/agent/auth.json")
    return json.load(open(path))["anthropic"]["access"]


def pi_full_second_block(payload_log: str) -> str:
    log = open(payload_log).read()
    marker = "=== before_provider_request payload ===\n"
    payload, _ = json.JSONDecoder().raw_decode(log.split(marker, 1)[1])
    return payload["system"][1]["text"]


def resolve_second_block(args) -> str:
    if args.preset == "neutral":
        return NEUTRAL
    if args.preset == "aside":
        return ASIDE_PREAMBLE
    if args.preset == "pi-full":
        if not args.payload:
            sys.exit("--preset pi-full requires --payload <pi_req.log>.")
        return pi_full_second_block(args.payload)
    if args.file:
        return open(args.file).read()
    if args.text is not None:
        return args.text
    sys.exit("One of --preset, --text, or --file is required.")


def probe(token: str, model: str, second: str) -> int:
    body = {
        "model": model,
        "max_tokens": 16,
        "system": [{"type": "text", "text": CC}, {"type": "text", "text": second}],
        "messages": [{"role": "user", "content": "hi"}],
    }
    request = urllib.request.Request(
        URL,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}", **HEADERS},
        method="POST",
    )
    try:
        response = urllib.request.urlopen(request, timeout=60)
        raw = response.read().decode()
        status = response.status
        headers = dict(response.headers)
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        status = error.code
        headers = dict(error.headers)

    message = "OK"
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict) and parsed.get("error"):
            message = parsed["error"].get("message", "")
    except json.JSONDecodeError:
        pass

    tag = "THIRD-PARTY" if "Third-party" in message else ""
    print(f"HTTP {status} {tag} {message[:100]}")
    if status == 200:
        keys = [k for k in headers if k.lower().startswith("anthropic-ratelimit-unified")]
        for key in sorted(keys):
            print(f"  {key}: {headers[key]}")
    return 0 if status == 200 else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--preset", choices=["neutral", "aside", "pi-full"], help="Preset for the second system block")
    parser.add_argument("--text", help="Text for the second system block")
    parser.add_argument("--file", help="File containing text for the second system block")
    parser.add_argument("--payload", help="Captured pi payload log for the pi-full preset")
    parser.add_argument("--model", default="claude-haiku-5-5")
    parser.add_argument("--token-source", default="pi", help="pi | aside | env:VAR_NAME")
    args = parser.parse_args()

    token = load_token(args.token_source)
    second = resolve_second_block(args)
    print(f"token: {args.token_source} ({token[:12]}...) | 2nd block len={len(second)}")
    return probe(token, args.model, second)


if __name__ == "__main__":
    sys.exit(main())
