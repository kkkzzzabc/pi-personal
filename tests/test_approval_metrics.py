"""Synthetic tests; no real session transcripts are fixtures."""
import importlib.util
import json
import pathlib
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('metrics', pathlib.Path(__file__).parents[1] / 'scripts/approval_metrics.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
ROOT = '/private/example'


def encoded(entries):
    return ('\n'.join(json.dumps(e) for e in entries) + '\n').encode()


def message(eid, parent, role, content, **kw):
    return {'type': 'message', 'id': eid, 'parentId': parent,
            'message': {'role': role, 'content': content, **kw}}


def tool(tid, name, **args):
    return {'type': 'toolCall', 'id': tid, 'name': name, 'arguments': args}


def result(eid, parent, tid, output, error=False):
    return message(eid, parent, 'toolResult', [{'type': 'text', 'text': output}], toolCallId=tid, isError=error)


class MetricsTests(unittest.TestCase):
    def test_system_patches_and_branch_context(self):
        entries = [message('s', None, 'system', '', sections={'project_context': m.OLD}),
                   message('u', 's', 'user', 'Please implement the local feature.'),
                   message('a', 'u', 'assistant', []),
                   message('s2', 'a', 'system', '', sections={'project_context': m.LEAN}),
                   message('a2', 's2', 'assistant', []),
                   message('s3', 'a2', 'system', '', sections={'project_context': None}),
                   message('a3', 's3', 'assistant', []),
                   message('a4', 'a', 'assistant', [{'type': 'text', 'text': 'Approval?'}])]
        r = m.extract(encoded(entries), ROOT)
        self.assertEqual(r['exposures'], ['lean', 'old', 'unknown'])
        self.assertEqual(r['prompt_rule_chars'], sorted([len(m.OLD), len(m.LEAN)]))
        self.assertEqual(r['candidates'][0]['user_entry_id'], 'u')
        self.assertEqual(r['ancestry_gaps'], 0)

    def test_legacy_content_and_checkpoint(self):
        entries = [message('s', None, 'system', m.OLD), message('a', 's', 'assistant', []),
                   {'type': 'compaction', 'id': 'c', 'parentId': 'a', 'summary': 'invented',
                    'systemMessage': {'content': '', 'sections': {'project_context': m.LEAN}}},
                   message('a2', 'c', 'assistant', [])]
        r = m.extract(encoded(entries), ROOT)
        self.assertEqual(r['exposures'], ['lean', 'old'])
        self.assertEqual(r['counts'].get('user', 0), 0)

    def test_read_quality_and_shell_ambiguity(self):
        entries = [message('u', None, 'user', 'Inspect the guide.'),
                   message('a', 'u', 'assistant', [tool('t', 'read', path=ROOT + '/AGENTS.md'),
                     tool('t2', 'read', path='docs/README.md'), tool('t3', 'bash', command='cat AGENTS.md; printf unrelated'),
                     tool('t4', 'read', path='docs/templates/spike.md'), tool('t5', 'read', path='docs/glossary.md')]),
                   result('r', 'a', 't', 'abcd'), result('r2', 'r', 't2', 'Truncated output'),
                   result('r3', 'r2', 't3', 'arbitrary mixed output'), result('r4', 'r3', 't4', 'failed', True)]
        r = m.extract(encoded(entries), ROOT)
        self.assertEqual([x['quality'] for x in r['rule_reads']], ['exact', 'partial', 'ambiguous-shell', 'failed', 'unmatched'])
        self.assertEqual(r['rule_reads'][0]['chars'], 4)
        self.assertEqual(m.legacy_original(encoded(entries), ROOT), 4 + len('Truncated output') + len('arbitrary mixed output') + len('failed'))

    def test_markdown_includes_partial_reads_without_mixing_shell_output(self):
        entries = [message('u', None, 'user', 'Inspect the instructions.'),
                   message('a', 'u', 'assistant', [
                       tool('r1', 'read', path='AGENTS.md'),
                       tool('r2', 'read', path='docs/README.md'),
                       tool('s1', 'bash', command='cat AGENTS.md'),
                       tool('s2', 'bash', command='cat docs/README.md'),
                       tool('bad', 'bash', command='cat AGENTS.md'),
                       tool('missing', 'read', path='docs/glossary.md')]),
                   result('b', 'a', 'r1', 'abcd'),
                   result('c', 'b', 'r2', 'Truncated direct output'),
                   result('d', 'c', 's1', 'mixed shell output'),
                   result('e', 'd', 's2', 'Truncated shell output'),
                   result('f', 'e', 'bad', 'Truncated error output', True)]
        r = m.extract(encoded(entries), ROOT)
        rendered = m.markdown({'sessions': [r]})
        direct = 4 + len('Truncated direct output')
        shell = len('mixed shell output') + len('Truncated shell output')
        self.assertIn(f'| {direct} | {shell} |', rendered)
        self.assertIn('Direct chars', rendered)
        self.assertEqual([x['quality'] for x in r['rule_reads']],
                         ['exact', 'partial', 'ambiguous-shell', 'partial', 'failed', 'unmatched'])

    def test_wrapped_read_and_unmatched(self):
        entries = [message('a', None, 'assistant', [tool('p', 'parallel', tool_uses=[
                    {'recipient_name': 'functions.read', 'parameters': {'path': 'AGENTS.md'}}])])]
        r = m.extract(encoded(entries), ROOT)
        self.assertEqual(r['counts']['tool:read'], 1)
        self.assertEqual(r['rule_reads'][0]['quality'], 'unmatched')
        self.assertTrue(r['rule_reads'][0]['wrapped'])

    def test_dialog_prose_dedup_and_plan_separation(self):
        entries = [message('u', None, 'user', [{'type': 'text', 'text': 'Can I end the session?'}]),
                   message('a', 'u', 'assistant', [{'type': 'text', 'text': 'Approval required for paid calls.'},
                       tool('q', 'ask_user', questions=[{'prompt': 'Authorize a paid call?'}]),
                       tool('p', 'exit_plan_mode')])]
        r = m.extract(encoded(entries), ROOT)
        self.assertEqual([x['kind'] for x in r['candidates']], ['user-wrap-up', 'dialog', 'plan-lifecycle'])
        # A dialog remains a candidate, not an automatically detected violation.
        self.assertNotIn('violations', r)

    def test_privacy_unknown_and_malformed(self):
        secret = 'SECRET_CREDENTIAL_123'
        entries = [message('s', None, 'system', secret, sections={'project_context': secret}),
                   message('a', 's', 'assistant', [{'type': 'thinking', 'thinking': secret},
                       tool('/private/sensitive-id', 'read', path=ROOT + '/AGENTS.md')]),
                   result('r', 'a', '/private/sensitive-id', secret),
                   {'type': 'unknown-future-entry', 'id': 'z', 'parentId': 'r'}]
        r = m.extract(encoded(entries) + b'not-json\n', ROOT)
        out = json.dumps(r)
        self.assertNotIn(secret, out)
        self.assertNotIn(ROOT, out)
        self.assertNotIn('sensitive-id', out)
        self.assertEqual(r['malformed_lines'], 1)

    def test_fork_duplicate_prefix_keeps_ancestry(self):
        entries = [message('u', None, 'user', 'Please implement.'),
                   message('a', 'u', 'assistant', [{'type': 'text', 'text': 'Approval?'}]),
                   message('b', 'a', 'assistant', [tool('t', 'ask_user')])]
        r = m.extract(encoded(entries), ROOT, {'u', 'a'})
        self.assertEqual(r['copied_entries_excluded'], 2)
        self.assertEqual(r['counts'].get('user', 0), 0)
        self.assertEqual(r['candidates'][0]['user_entry_id'], 'u')

    def test_frozen_cutoff_hash_and_determinism(self):
        with tempfile.TemporaryDirectory() as d:
            path = pathlib.Path(d) / 'date_fixture-id.jsonl'
            data = encoded([{'type': 'session', 'id': 'fixture-id'}, message('u', None, 'user', 'hello')])
            path.write_bytes(data)
            manifest = m.freeze([path])
            path.write_bytes(data + encoded([message('a', 'u', 'assistant', [])]))
            r = m.analyze(manifest, pathlib.Path(d), ROOT)
            self.assertEqual(r, m.analyze(manifest, pathlib.Path(d), ROOT))
            self.assertEqual(r['sessions'][0]['counts'].get('assistant', 0), 0)
            path.write_bytes(b'x' + path.read_bytes()[1:])
            with self.assertRaises(ValueError):
                m.analyze(manifest, pathlib.Path(d), ROOT)

    def test_partial_json_cutoff_and_path_traversal(self):
        r = m.extract(encoded([message('a', None, 'assistant', [
            tool('t', 'read', path='docs/backlog/../../private.txt')])]) + b'{"type":', ROOT)
        self.assertEqual(r['malformed_lines'], 1)
        self.assertEqual(r['rule_reads'], [])

    def test_unavailable_fork_parent(self):
        with tempfile.TemporaryDirectory() as d:
            path = pathlib.Path(d) / 'date_fixture-id.jsonl'
            path.write_bytes(encoded([{'type': 'session', 'id': 'fixture-id', 'parentSession': '/private/date_parent.jsonl'}]))
            r = m.analyze(m.freeze([path]), pathlib.Path(d), ROOT)
            self.assertTrue(r['sessions'][0]['fork_parent_unavailable'])
            self.assertNotIn('/private', json.dumps(r))


if __name__ == '__main__':
    unittest.main()
