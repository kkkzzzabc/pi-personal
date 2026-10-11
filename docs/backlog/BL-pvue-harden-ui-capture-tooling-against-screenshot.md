---
id: BL-pvue
title: Harden UI capture tooling against screenshot RPC deadlines and interrupted startup
status: candidate
kind: Design
---

# BL-pvue — Harden UI capture tooling against screenshot RPC deadlines and interrupted startup

- Outcome: Keep offline captures reproducible without relying on agent-tty internal imports, and recover isolated sessions after abrupt orchestrator termination.
- Next action: When capture tooling is revisited, check whether the installed agent-tty supports a bounded screenshot timeout through its public CLI/API and define interruption cleanup tests.
- Done when: A supported screenshot path replaces the internal adapter, or its compatibility contract is explicitly tested; interruption recovery covers termination before run.json is written.
- Trigger: Repeated capture use, an agent-tty update, or a request to harden capture infrastructure.
- Blocked by: A supported CLI timeout path may require an upstream tool release. No install/update is approved by this candidate.
- References: [Capture-tool limitations](../spikes/2026-10-11-extension-ui-capture-baseline.md), [Tooling README](../../scripts/ui-captures/README.md).
- Approval: Candidate only.
