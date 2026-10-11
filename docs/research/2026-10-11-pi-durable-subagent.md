---
title: Subagents in the local pi fork's experimental durable runtime
date: 2026-10-11
session: 01a128d8-5cfb-767b-ad59-fc905ec35d3a
based_on:
  - docs/research/2026-10-11-pi-subagents.md
sources:
  - repo: kkkzzzabc/pi
    path: /Users/kkkzzzabc/workspace/projects/personal/pi
    version: 1.1.0
    commit: b1a78306c
---

# Subagents in the local pi fork's experimental durable runtime

## Scope

The local pi fork contains an experimental subagent implementation. This
research describes how it works and whether its design or code can serve
subagents in the main pi CLI. It supports the choice between an
extension-only design, an extension plus small fork APIs, and a core
subagent. It does not decide.

- In scope:
  - `packages/durable` (`@earendil-works/pi-durable`) concepts relevant to
    subagents;
  - the durable demo app's `subagent` tool;
  - the package's foreground and background subagent examples;
  - whether the main CLI ships or uses any of it.
- Out of scope: storage internals, Chord document state, the durable TUI,
  and running the examples.
- Depth: documentation and the relevant source files were read. Nothing
  was executed. Paths below are relative to the fork root. None of the
  cited files has uncommitted changes.

## Summary

- **Separate runtime.** pi-durable is a separate, explicitly experimental
  agent harness. Conversations, turns, tool calls, and tasks are committed
  to storage (SQLite or memory) before they are shown, so work resumes
  after a crash. It is not the `AgentSession` runtime the main `pi` CLI and
  its extensions use.
- **Subagents are first-class.** A subagent is another conversation owned
  by the tool call's task. Ownership gives cascading abort ("parent idle
  only when child idle") and replay-safe reuse after a crash, without extra
  protocol.
- **Recursion and model choice are configuration.** The child starts as a
  copy of the owner's agent (model, extensions, tools, cwd). The tool
  removes its own extension from the child, so the child cannot delegate.
- **Prompt caching is structural.** System sections and tool changes are
  stored as positional entries, and only changes are re-sent, which keeps
  provider caches warm. pi-subagents had to add this behavior on top of
  the CLI.
- **Not available to the CLI.** The CLI does not use it. `pi-coding-agent`
  excludes `dist/experimental` from its package files, and the installed
  release has no `pi-durable` package. Reusing the code in the CLI means
  either porting the CLI to this harness or copying only its ideas.

## Questions

1. What is pi-durable, and how does it relate to the main CLI runtime?
2. How does the durable `subagent` tool create, run, and return a child?
3. How do abort, ownership, background work, and crash recovery apply to
   subagents?
4. How are the child's model, tools, prompt, and recursion controlled?
5. What can the main-CLI subagent design take from it?

## Findings

### 1. pi-durable and the main CLI

- The package README marks it experimental with unstable APIs
  (`packages/durable/README.md:3`).
- Its core concepts are Harness, Conversation, Entry, Commit, Document,
  Task, Submission, Extension, Registry, and Agent. Every change goes
  through atomic commits, and nothing is shown before it is stored
  (`packages/durable/README.md:79-100`).
- The durable demo app is a separate entry point under
  `packages/coding-agent/src/experimental/durable/`. It reuses pi's model
  runtime, auth, settings, and TUI components, but runs the durable Harness
  as the agent (`packages/coding-agent/src/experimental/durable/README.md:1-10`).
  The README says it lacks the session list and resume picker, forks, tree
  navigation, extensions, prompt templates, images, and `/login`
  (`packages/coding-agent/src/experimental/durable/README.md:66`).
- Outside `src/experimental/`, nothing in `packages/coding-agent/src`
  imports `pi-durable` (observed with `grep`).
- The package `files` list excludes `dist/experimental`
  (`packages/coding-agent/package.json:29-39`). The installed release's
  `node_modules/@earendil-works/` contains no `pi-durable` (observed).

### 2. The durable `subagent` tool

- The tool takes a single `task` string. Its description tells the model
  that the child does not see this conversation
  (`packages/coding-agent/src/experimental/durable/subagent.ts:24-31`).
- **Create.** Inside one commit, the tool looks for a conversation already
  owned by this call's task and reuses it. Otherwise it creates one with
  `ownership: { kind: "task", taskId }` and removes the `subagent`
  extension from it
  (`packages/coding-agent/src/experimental/durable/subagent.ts:34-42`).
- **Run and return.** The tool submits the task as input with a stable
  `requestId`, waits for the child to settle, and returns the text of the
  child's answer entry. A non-`done` status throws
  (`packages/coding-agent/src/experimental/durable/subagent.ts:43-51`).
  `api.details({ conversationId })` lets the UI attach to the child, and
  `/agents` switches the view to it so the user can steer it
  (`packages/coding-agent/src/experimental/durable/README.md:26-29`).
- The demo installs the tool into its registry next to the coding tools
  (`packages/coding-agent/src/experimental/durable/runtime.ts:129-134`).

### 3. Abort, ownership, background work, and recovery

- **Abort.** Owned work belongs to its owner. Aborting or failing the call
  aborts the child, and the parent is idle only once the child is
  (`packages/durable/README.md:527-531`).
- **Background.** A task created with `{ background: true }` is a boundary.
  Work it owns survives the parent's abort and does not keep the parent
  busy (`packages/durable/README.md:531`).
- **Background example.** `test/examples/23-subagent-background.ts`
  (363 lines) implements persistent named subagents behind one tool, which
  can spawn, message (steer or follow up), wait, stop, and list them. A
  background reporter task posts each answer back to the parent as a
  follow-up input. Request IDs prevent duplicate delivery after a restart
  (`packages/durable/README.md:533-536`,
  `packages/durable/test/examples/23-subagent-background.ts:1-5`).
- **Recovery.** `replay: "safe"` plus the ownership index means a rerun
  after a crash finds the same child and submission
  (`packages/coding-agent/src/experimental/durable/subagent.ts:32-37`).
- **Task graph.** The live task graph exposes each task's owner and the
  conversations it owns, for a task panel
  (`packages/durable/README.md:565-579`).

### 4. Model, tools, prompt, and recursion

- **Inherited agent.** A task-owned conversation starts as a copy of its
  owner's agent. `configure()` can change the model, thinking level,
  extensions, tools, model-visible tools (`modelTools`), instructions, and
  cwd in one commit (`packages/durable/README.md:266-287`).
- **Recursion.** The demo blocks recursion by removing the `subagent`
  extension from the child. The README example also switches the child to
  a cheaper model
  (`packages/coding-agent/src/experimental/durable/subagent.ts:38-40`,
  `packages/durable/README.md:513-514`). There is no depth counter; the
  exclusion is structural.
- **Fresh context.** The child conversation is new, so it starts without
  the parent transcript. Forks exist separately and see the parent's
  entries up to a given entry (`packages/durable/README.md:482-489`).
- **Prompt.** The system prompt is built from extension sections, and
  per-conversation `instructions` render last. Section and tool changes are
  stored as positional entries, and only changes are re-sent
  (`packages/durable/README.md:256-264`).

### 5. What the main-CLI design can take from it

These are recommendations inferred from findings 1-4, not decisions.

- **Ownership instead of separate bookkeeping.** A child bound to the
  calling tool's lifecycle gives abort cascade and "parent waits for child"
  for free. In the CLI, the closest equivalent is driving the child from
  the tool's `execute()` with its abort signal, which the earlier spike
  showed works (`docs/spikes/2026-10-11-sdk-child-session-from-extension.md`).
- **Recursion by removal.** Removing the delegating tool or extension from
  the child is the same structural rule pi-subagents uses, and it needs no
  prompt text to enforce.
- **Inherit, then narrow.** Starting the child from the parent's agent and
  narrowing it is the inverse of pi-subagents' "clean prompt, explicit
  allowlist" default. Either works; the choice affects how much
  configuration each role needs.
- **Durability is out of reach without the harness.** Crash-safe replay,
  persistent background subagents, and the task graph depend on
  pi-durable's commit and task model. The CLI's `AgentSession` has no
  equivalent. Adopting them would mean porting the CLI to the harness,
  which is beyond any subagent feature.

## Open questions

- Is pi-durable intended to replace the CLI runtime later? Nothing in the
  fork says so; the code is marked experimental and excluded from the
  package.
- Could a CLI subagent store child transcripts in a form a future durable
  port could adopt? This was not investigated.

## References

- `packages/durable/README.md`
- `packages/durable/test/examples/22-subagent-foreground.ts`,
  `23-subagent-background.ts`
- `packages/coding-agent/src/experimental/durable/README.md`, `subagent.ts`,
  `runtime.ts`
- `packages/coding-agent/package.json`
