---
name: preflight
description: >
    Pre-commit and pre-push quality gate. Reads `CLAUDE.md` to discover what checks the project defines, runs them
    in order, and reports. Use this skill whenever the user wants to verify the project is ready to commit, push,
    merge, or open a PR — including phrases like "preflight", "check everything", "run checks", "is this ready",
    "verifica todo", "antes de commit", "antes de push", "está listo", "revisa antes", or any context where the user
    is wrapping up work and about to share it. Trigger this even when the user phrases it casually ("looks good?",
    "se ve bien?") if they're clearly at the end of a unit of work.
allowed-tools: Bash, Read, Grep
user-invocable: true
---

# preflight

Quality gate before committing. Diagnoses only — never fixes.

The skill is the algorithm. The actual checks are defined by the project in `CLAUDE.md` under the section
`## Quality gates`.

## Contract with `CLAUDE.md`

The project's `CLAUDE.md` (at the repository root) must contain a section titled exactly `## Quality gates` with a
markdown table of this shape:

```
| Step       | Command              | Type    |
| ---------- | -------------------- | ------- |
| <name>     | <shell command>      | blocker |
| <name>     | <shell command>      | warning |
| ...        | ...                  | ...     |
```

Required:

- Three columns in this order: `Step`, `Command`, `Type`.
- `Type` is one of `blocker` or `warning`.
- Rows are run top-to-bottom, in the order listed.

If the section is missing, the table is malformed, or `Type` contains an unknown value, halt with a clear error pointing
the user to this contract. Don't guess — guessing means running things the user didn't approve.

## Algorithm

1. **Read** `CLAUDE.md` and locate the `## Quality gates` section. Validate the table shape.
2. **Run each row** in listed order. For each row, capture exit code, stdout, and stderr.
3. **On the first `blocker` failure**, stop running subsequent rows. Mark them as `blocked` in the report.
4. **`warning` failures** are reported but do not halt — keep running later rows.
5. **Report all rows**, including the ones that didn't run, so the user sees full status.

If invoked from a subdirectory, find the repository root (the directory containing `CLAUDE.md`) and run commands from
there. The table assumes commands are run at the root unless explicitly stated otherwise.

## Report format

```
Preflight ─────────────────────────────────

  ✓  <step name>
  ⚠  <step name> — <one-line summary of the warning>
  ✗  <step name> — <error count or summary>
  -  <step name> — blocked by previous failure

Result: <N blockers, M warnings> | Clean

Details:
  <step name>:
    <relevant excerpt of stderr/stdout, trimmed>
```

Use:

- `✓` for pass.
- `⚠` for `warning` row that failed.
- `✗` for `blocker` row that failed.
- `-` for steps not run because an earlier blocker failed.

In `Details`, include only sections for failed rows. Trim noise — show what the user needs to fix, not full output.

## Rules

- **Diagnostic only, no auto-fix.** Preflight reports what's broken so the user can decide what to do. Auto-fixing
  changes their working tree without consent — that's the user's call, not the gate's. The user runs the project's
  formatter or linter when they want fixes applied.

- **The `CLAUDE.md` table is the source of truth for what runs.** If a step isn't listed there, it doesn't exist for
  this project. Inventing a step means running something the user didn't approve, which breaks the contract that makes
  the skill safe to invoke.

- **Run rows in listed order, never reordered.** The order is intentional — typically format/lint come before tests
  because format-only changes would invalidate a test run anyway, and there's no point exercising tests on code that
  won't compile. Reordering changes that economy without consent.

- **Distinguish tool failures from check failures.** If a row's command can't run at all (binary missing, permission
  denied, command not found), that's a setup problem, not a code problem. Saying "tests failed" when the test runner
  couldn't even start misleads the user about where to look. Report tool errors explicitly and continue with later rows
  where possible.

- **Trim verbose output to actionable lines.** When stderr is huge, the user needs the file:line + message they have to
  fix, not the full output. Dumping everything buries the signal. If you can't tell what's actionable, show the last ~10
  lines and stop — better truncated than overwhelming.
