#!/usr/bin/env python3
"""Extract sanitized observational metrics from explicitly selected Pi sessions.

This locates candidates, not approval violations. Semantic classifications require
branch-local human review. Inputs are read as bytes, never loaded by Pi itself.
"""
import argparse
import collections
import hashlib
import json
import pathlib
import re
import sys

LEAN = 'An explicit request to act'
OLD = 'Investigation is not authorization'
APPROVAL = re.compile(r'approve|approval|shall I|should I|proceed\?|승인|적용할까요|진행할까요|결정해|확인해.*주|허락', re.I)
WRAP = re.compile(r'마무리|종료해|끝내도|문서.*동기|end (?:the )?session|wrap.up|docs.*sync', re.I)
RULE_PATH = re.compile(r'(?:AGENTS\.md|docs/(?:README\.md|backlog\.md|glossary\.md|templates/[\w.-]+|backlog/[\w.-]+\.md))(?![\w/.-])')
LEGACY_PATH = re.compile(r'(?:docs/(?:README|backlog|glossary)\.md|AGENTS\.md|docs/templates/[\w.-]+)')
REF = re.compile(r'^[\w:|.-]{1,200}$')


def ref(value):
    """Never put arbitrary tool arguments or paths in a persisted reference."""
    return value if isinstance(value, str) and REF.fullmatch(value) else None


def text(content):
    if isinstance(content, str):
        return content
    return '\n'.join(c.get('text', '') for c in content or []
                     if isinstance(c, dict) and c.get('type') == 'text')


def category(path, workspace):
    if not isinstance(path, str):
        return None
    if path.startswith(workspace.rstrip('/') + '/'):
        path = path[len(workspace.rstrip('/')) + 1:]
    if '..' in pathlib.PurePosixPath(path).parts:
        return None
    if path == 'AGENTS.md':
        return 'agents'
    if path == 'docs/README.md':
        return 'docs-guide'
    if path == 'docs/glossary.md':
        return 'glossary'
    if path == 'docs/backlog.md' or path.startswith('docs/backlog/'):
        return 'backlog'
    if path.startswith('docs/templates/'):
        return 'templates'
    return None


def calls(blocks):
    """Flatten only the documented parallel wrapper; arbitrary JSON is not code."""
    for c in blocks if isinstance(blocks, list) else []:
        if c.get('type') != 'toolCall':
            continue
        yield c
        if c.get('name') in ('parallel', 'multi_tool_use.parallel'):
            for i, child in enumerate(c.get('arguments', {}).get('tool_uses', [])):
                yield {'id': str(c.get('id', '')) + ':' + str(i),
                       'name': child.get('recipient_name', '').removeprefix('functions.'),
                       'arguments': child.get('parameters', {}), 'wrapped': True}


def read_entries(data):
    entries, malformed = [], 0
    for number, line in enumerate(data.splitlines(), 1):
        try:
            e = json.loads(line)
            if not isinstance(e, dict):
                raise ValueError('Entry must be an object')
            entries.append((number, e))
        except (ValueError, UnicodeDecodeError):
            malformed += 1
    return entries, malformed


def prompt_patch(state, message):
    state = dict(state)
    for k, v in (message.get('sections') or {}).items():
        if v is None:
            state.pop(k, None)
        elif isinstance(v, str):
            state[k] = v
    if text(message.get('content')):
        state['_content'] = state.get('_content', '') + '\n' + text(message['content'])
    return state


def exposure(state):
    joined = '\n'.join(state.values())
    lean, old = LEAN in joined, OLD in joined
    return 'mixed' if lean and old else 'lean' if lean else 'old' if old else 'unknown'


def extract(data, workspace, duplicate_ids=()):
    entries, malformed = read_entries(data)
    header = next((e for _, e in entries if e.get('type') == 'session'), {})
    result = {'session_id': ref(header.get('id')), 'bytes': len(data),
              'sha256': hashlib.sha256(data).hexdigest(), 'malformed_lines': malformed,
              'counts': {}, 'models': [], 'exposures': [], 'prompt_rule_chars': [],
              'candidates': [], 'rule_reads': [], 'legacy_meta_chars': 0,
              'copied_entries_excluded': 0, 'ancestry_gaps': 0}
    counts = collections.Counter()
    models, seen_exposures, prompt_sizes = set(), set(), set()
    pending, states, users = {}, {}, {}
    duplicates = set(duplicate_ids)
    episode = 0
    approval_seen = set()
    legacy_calls = {}
    for number, e in entries:
        eid, parent = e.get('id'), e.get('parentId')
        state = states.get(parent, {})
        user = users.get(parent)
        if parent and parent not in states:
            result['ancestry_gaps'] += 1
        if e.get('type') == 'compaction' and e.get('systemMessage'):
            state = prompt_patch({}, e['systemMessage'])
        m = e.get('message', {})
        role = m.get('role')
        if role == 'system':
            state = prompt_patch(state, m)
        if role == 'user':
            user = eid
        if eid:
            states[eid] = state
            users[eid] = user
        if eid in duplicates:
            result['copied_entries_excluded'] += 1
            continue
        counts['entry:' + str(e.get('type'))] += 1
        if not role:
            continue
        counts[role] += 1
        visible = text(m.get('content'))
        base = {'entry_id': ref(eid), 'line': number, 'user_entry_id': ref(user)}
        if role == 'user':
            episode += 1
            if WRAP.search(visible):
                result['candidates'].append({**base, 'kind': 'user-wrap-up'})
        if role == 'assistant':
            models.add((str(m.get('provider', 'unknown')), str(m.get('model', 'unknown'))))
            seen_exposures.add(exposure(state))
            # Only named project/rule sections; do not count all skills as rules.
            for key, value in state.items():
                if key in ('project_context', 'project_instructions') and (LEAN in value or OLD in value):
                    prompt_sizes.add(len(value))
            for c in calls(m.get('content')):
                name, args = c.get('name'), c.get('arguments') or {}
                counts['tool:' + str(name)] += 1
                kind = 'plan-lifecycle' if name in ('enter_plan_mode', 'exit_plan_mode') else 'dialog' if name == 'ask_user' else None
                if kind:
                    result['candidates'].append({**base, 'kind': kind, 'tool_call_id': ref(c.get('id'))})
                    if kind == 'dialog':
                        approval_seen.add(episode)
                cat = category(args.get('path'), workspace)
                legacy = cat is not None and name == 'read'
                if name == 'bash':
                    command = args.get('command', '')
                    hits = LEGACY_PATH.findall(command)
                    legacy = bool(hits) and 'cd /Users/kkkzzzabc/workspace/projects/personal/pi ' not in command
                    cats = {category(h, workspace) for h in RULE_PATH.findall(command)} - {None}
                    if 'scripts/backlog.py list' in command:
                        cats.add('backlog')
                    cat = ','.join(sorted(cats)) if cats else None
                if legacy:
                    legacy_calls[c.get('id')] = True
                if name in ('read', 'bash') and cat:
                    pending[c.get('id')] = {**base, 'tool_call_id': ref(c.get('id')),
                        'category': cat, 'tool': name, 'wrapped': c.get('wrapped', False)}
            # Dialog/prose are one episode; lifecycle remains separately countable.
            if APPROVAL.search(visible) and episode not in approval_seen:
                result['candidates'].append({**base, 'kind': 'approval-prose'})
                approval_seen.add(episode)
        if role == 'toolResult':
            size = sum(len(c.get('text', '')) for c in m.get('content', []) if c.get('type') == 'text')
            if m.get('toolCallId') in legacy_calls:
                result['legacy_meta_chars'] += size
            read = pending.pop(m.get('toolCallId'), None)
            if read:
                truncated = bool(re.search(r'truncat|\[Showing |more lines in file|50(?:\.0)?KB limit', visible, re.I))
                # Shell attribution is deliberately conservative even for cat-only commands.
                quality = 'failed' if m.get('isError') else 'partial' if truncated else 'exact' if read['tool'] == 'read' else 'ambiguous-shell'
                result['rule_reads'].append({**read, 'result_entry_id': ref(eid), 'chars': size, 'quality': quality})
    for read in pending.values():
        result['rule_reads'].append({**read, 'chars': 0, 'quality': 'unmatched'})
    result['counts'] = dict(sorted(counts.items()))
    result['models'] = [list(m) for m in sorted(models)]
    result['exposures'] = sorted(seen_exposures)
    result['prompt_rule_chars'] = sorted(prompt_sizes)
    return result


def legacy_original(data, workspace):
    """Faithful old docm.py metaRead proxy, including its shell/error weaknesses."""
    entries, _ = read_entries(data)
    tracked, sizes = {}, collections.Counter()
    for _, e in entries:
        m = e.get('message', {})
        if m.get('role') == 'assistant':
            for c in m.get('content', []) if isinstance(m.get('content'), list) else []:
                if c.get('type') != 'toolCall':
                    continue
                a, name = c.get('arguments') or {}, c.get('name')
                p = a.get('path', '') or ''
                if p.startswith(workspace.rstrip('/') + '/'):
                    p = p[len(workspace.rstrip('/')) + 1:]
                p = p if (p.startswith('docs/') or p == 'AGENTS.md') and not p.startswith('/') else None
                if name == 'bash':
                    command = a.get('command', '')
                    hits = LEGACY_PATH.findall(command)
                    if hits and 'cd /Users/kkkzzzabc/workspace/projects/personal/pi ' not in command:
                        p = '(bash)' + hits[0]
                tracked[c.get('id')] = (name, p)
        elif m.get('role') == 'toolResult':
            name, p = tracked.get(m.get('toolCallId'), (None, None))
            if p and name in ('read', 'bash'):
                sizes[p] += sum(len(c.get('text', '')) for c in m.get('content', []) if c.get('type') == 'text')
    return sum(v for p, v in sizes.items() if any(s in p for s in ('README', 'backlog', 'AGENTS', 'templates', 'glossary')))


def freeze(paths):
    rows = []
    for path in paths:
        data = pathlib.Path(path).read_bytes()
        entries, _ = read_entries(data)
        header = next(e for _, e in entries if e.get('type') == 'session')
        rows.append({'session_id': ref(header['id']), 'bytes': len(data),
                     'sha256': hashlib.sha256(data).hexdigest(),
                     'last_timestamp': next((e.get('timestamp') for _, e in reversed(entries) if e.get('timestamp')), None)})
    return {'sessions': rows}


def analyze(manifest, directory, workspace):
    # Resolve by header ID and filename suffix, without persisting absolute paths.
    selected, ids_by_session = [], {}
    for row in manifest['sessions']:
        matches = list(directory.glob('*_' + row['session_id'] + '.jsonl'))
        if len(matches) != 1:
            raise ValueError('Expected one input for session ' + row['session_id'])
        data = matches[0].read_bytes()[:row['bytes']]
        if hashlib.sha256(data).hexdigest() != row['sha256']:
            raise ValueError('Frozen input hash mismatch for ' + row['session_id'])
        entries, _ = read_entries(data)
        header = next(e for _, e in entries if e.get('type') == 'session')
        ids_by_session[row['session_id']] = {e['id'] for _, e in entries if e.get('type') != 'session' and e.get('id')}
        selected.append((data, header))
    results = []
    for data, header in selected:
        parent = header.get('parentSession')
        parent_id = pathlib.Path(parent).stem.split('_')[-1] if parent else None
        duplicates = ids_by_session.get(parent_id, ())
        report = extract(data, workspace, duplicates)
        report['fork_parent_unavailable'] = bool(parent and parent_id not in ids_by_session)
        report['legacy_original_meta_chars'] = legacy_original(data, workspace)
        results.append(report)
    return {'schema': 1, 'sessions': results}


def markdown(report):
    lines = ['# Session metrics', '', '| Session | Exposure | Users | Direct chars | Ambiguous shell chars |', '|---|---|---:|---:|---:|']
    for r in report['sessions']:
        direct = sum(read['chars'] for read in r['rule_reads']
                     if read['tool'] == 'read' and read['quality'] in ('exact', 'partial'))
        shell = sum(read['chars'] for read in r['rule_reads']
                    if read['tool'] == 'bash' and read['quality'] in ('ambiguous-shell', 'partial'))
        lines.append(f"| {r['session_id']} | {','.join(r['exposures'])} | {r['counts'].get('user', 0)} | {direct} | {shell} |")
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    f = sub.add_parser('freeze', help='Print a hash/byte-cutoff manifest for explicit input files')
    f.add_argument('files', nargs='+')
    a = sub.add_parser('analyze', help='Read only frozen byte prefixes; print sanitized metrics')
    a.add_argument('--manifest', type=pathlib.Path, required=True)
    a.add_argument('--directory', type=pathlib.Path, required=True)
    a.add_argument('--workspace', required=True)
    a.add_argument('--format', choices=('json', 'markdown'), default='json')
    args = parser.parse_args()
    if args.command == 'freeze':
        output = freeze(args.files)
    else:
        output = analyze(json.loads(args.manifest.read_text()), args.directory, args.workspace)
        if args.format == 'markdown':
            print(markdown(output), end='')
            return
    print(json.dumps(output, indent=2, ensure_ascii=True, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        # Do not expose raw filesystem errors, which can contain sensitive paths.
        print('Metric extraction failed: invalid or unavailable selected input.', file=sys.stderr)
        sys.exit(1)
