# Faux scenario format

The faux model (`scripts/faux-model.ts`) answers each model call with the
next response in the scenario. After the list is exhausted, every call
returns `whenExhausted`.

```json
{
  "responses": [
    { "text": "Plain answer" },
    { "thinking": "Reasoning shown as thinking", "text": "Answer" },
    { "toolCalls": [
      { "name": "write", "args": { "path": "{{cwd}}/out.txt", "content": "x" } },
      { "name": "read", "args": { "path": "README.md" } }
    ] },
    { "text": "STEP-3-DONE" }
  ],
  "whenExhausted": "[tui-check] Scenario exhausted."
}
```

- Each response needs at least one of `text`, `thinking`, `toolCalls`.
- A response with `toolCalls` makes pi run the tools and call the model
  again, which consumes the next response. Plan one follow-up response per
  tool round.
- Tool names and arguments are not validated by the scenario; pi validates
  them against the tool schema when the call runs.
- Use distinctive texts (`STEP-3-DONE`) so `wait --text` cannot match
  earlier screen content.
- The position in the scenario is stored in `<runDir>/logs/faux-state.json`.
  It continues across session replacement (`/new`, `newSession`, fork,
  resume) and `launch.sh` relaunches, which re-create the extensions. Plan
  responses for the whole run, not per session.

## Templates

Resolved in every string, at each model call:

| Template | Value |
|---|---|
| `{{cwd}}` | pi's working directory (the run's work dir) |
| `{{env:NAME}}` | Environment variable of the pi process |
| `{{entry:<customType>.<dot.path>}}` | Field of the latest `custom` session entry of that type on the current branch (written with `pi.appendEntry`) |
| `{{lastUser}}` | Text of the latest user message |

An unresolved template does not guess: the model answers
`[tui-check] Template error in response <n>: …` instead, which is visible on
screen and in the session.

## Example: plan-mode write guard

Checks that plan mode blocks writes outside the plan file and allows the plan
file (extension `extensions/plan-mode`, plan file path taken from its
`plan-mode` custom entry).

```json
{
  "responses": [
    { "toolCalls": [
      { "name": "write", "args": { "path": "README.md", "content": "CHANGED" } },
      { "name": "write", "args": { "path": "{{entry:plan-mode.planFile}}", "content": "# Plan\n1. Step one\n" } }
    ] },
    { "text": "PLAN-WRITTEN" }
  ]
}
```

```bash
# plan-mode.json: {"plansDir": "/tmp/…/plans"}; fixture/ contains README.md
node scripts/start.mjs --scenario scenario.json \
  --extension extensions/plan-mode/index.ts \
  --agent-file plan-mode.json=plan-mode.json \
  --fixture fixture/
```

Then: `/plan on` (Escape, Enter) → wait `Plan mode on` → type a prompt,
Enter → wait `PLAN-WRITTEN` → expect the block message on screen,
`work/README.md` unchanged, the plan file written, footer `⏸ plan`.
