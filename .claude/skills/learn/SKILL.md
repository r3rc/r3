---
name: learn
description: >
    Implementation methodology that learns from reference sources before writing new code, to avoid reinventing the
    wheel and inherit battle-tested patterns. Reads `CLAUDE.md` to discover which reference sources the project keeps,
    evaluates relevance, and pauses for user confirmation before reading any source. Distills patterns from
    implementations and tests. Use this skill whenever the user is about to implement non-trivial new functionality —
    including phrases like "implement X", "build Y", "add feature Z", "create a new module", "write a function that…",
    "necesito escribir", "implementa X", "construye Y", "agrega Z", "crea un módulo para", or any task that involves
    writing new code where mature codebases likely have prior art to learn from. Trigger this even when the user
    doesn't explicitly ask to "learn" — if they're about to build something non-trivial and reference sources exist,
    distilling from them first beats writing blind. Don't trigger for trivial additions (single log statements,
    comment changes, one-line tweaks, renames) or for purely architectural discussions where the user is still
    thinking out loud and hasn't committed to building yet — the methodology is for new functionality that benefits
    from distilling prior art, not for cosmetic edits or pure design talk.
allowed-tools: Read, Glob, Grep, Bash
user-invocable: true
---

# learn

Learn from mature codebases before writing code. Reference sources encode years of edge cases, design decisions, and
test scenarios. Distill their patterns — never copy.

The skill is the methodology. The actual reference sources available to the project are listed in `CLAUDE.md`. The user
is in the loop on which sources get read.

## Contract with `CLAUDE.md`

The project's `CLAUDE.md` (at the repository root) must contain a section titled exactly `## Reference sources` with a
markdown table of this shape:

```
| Source     | Path                | Domain                                          |
| ---------- | ------------------- | ----------------------------------------------- |
| <name>     | <relative path>     | <prose description of what this source covers>  |
| ...        | ...                 | ...                                             |
```

Required:

- Three columns in this order: `Source`, `Path`, `Domain`.
- `Path` is the location to read from (typically under `.tinker/sources/`).
- `Domain` is prose describing what the source is good for. Used to evaluate relevance.

If the section is missing or malformed, treat the picks list as empty and proceed to the mandatory pause.

## Process

### Step 1 — Understand what's being built

- **What** is being implemented? (data structure, protocol, module, command, …)
- **What properties** does it need? (streaming, persistence, ordering, cancellability, error model, …)
- **What's the scope?** (single function, module, subsystem)

If the request is vague, ask one clarifying question. Don't guess.

### Step 2 — Evaluate sources

Read the `## Reference sources` section of `CLAUDE.md`. For each row, judge relevance against the task using the
`Domain` column:

- Does the `Domain` description match the problem domain?
- Could this source plausibly contain a similar implementation, similar tests, or similar design decisions?

The result is a list of **picked sources**, which may be empty. Do not read anything yet.

### ⛔ MANDATORY PAUSE — Confirm sources before reading

Before reading anything, present the picks to the user and wait for a response. This pause happens **always**,
regardless of how many sources were picked.

**If picks is empty** (no `Domain` matched, or `## Reference sources` is missing):

> "I didn't find a reference source whose domain matches this task. Do you want to add one for this task? If yes, give
> me the path and a short description of what it covers. Otherwise, I'll proceed without a reference."

**If picks is non-empty**:

> "I plan to read these sources for this task:
>
> 1. `<source>` — `<path>` — <one-line domain summary>
> 2. ...
>
> Confirm reading all of them? You can also discard any of these, or add more sources I haven't picked."

Wait for the user's response. Possible outcomes:

- **Confirm** → proceed to step 3 with the picks as-is.
- **Discard** → remove the named sources from the picks. Proceed to step 3 with the remainder.
- **Add** → the user names a source and gives a path. Append it to the picks. Proceed to step 3.
- **Proceed without reference** → skip step 3 entirely. Document this explicitly in the synthesis step.

Sources added in this pause apply to the **current task only**. They are not persisted to `CLAUDE.md` automatically — if
the user wants the addition permanent, they edit `CLAUDE.md` themselves.

### Step 3 — Read every confirmed source

For every source in the confirmed list, do both of the following. The user already had the chance to discard in the
pause, so at this point every source on the list gets read.

**Find similar code.** Browse the source by domain concept, not by syntax. Read public APIs to understand the shape
(factories, lifecycle, error model). Read implementations to find edge cases handled inline.

**Read tests.** Tests are the most valuable artifact — they reveal what the authors considered important. Extract:

- **Normal cases** — typical usage paths.
- **Edge cases** — empty input, partial input, boundaries, very large inputs.
- **Error conditions** — invalid input, cancellation, timeouts, resource exhaustion.
- **Invariants** — ordering, idempotency, no leaks.

List these as concerns, not as test code.

If after browsing a source genuinely has nothing relevant (the picker was over-optimistic), document that explicitly in
the synthesis step. Don't silently skip — be honest about the miss.

### Step 4 — Synthesize

Before writing any code, produce a brief synthesis:

```
## Implementation plan for <feature>

**Learned from:** <which sources/files were read, or "no reference sources used (user-confirmed)">

**Patterns to adopt:**
- <pattern and why>

**Edge cases to handle:**
- <case extracted from tests>

**Traps to avoid:**
- <subtlety found while reading the implementation>

**Approach:**
- <how it will be implemented, informed by the above>
```

For straightforward additions, keep it to a few lines.

### ⛔ STOP — Get approval before implementing

For significant features, ask: _"This is my plan based on what I found. Should I proceed?"_

For small additions, a brief note is enough — don't block on trivial things.

### Step 5 — Hand off to implementation

Once the synthesis is approved, the actual writing happens outside this skill. The main agent (or a follow-up session)
writes the code with the distilled knowledge:

- Apply the patterns identified in step 4.
- Cover the edge cases extracted in step 3.
- Write tests for the same concerns.
- Keep the API similar to mature implementations unless there's a concrete reason to diverge.

This skill stops at the approved plan. It doesn't write code itself — that keeps the methodology honest about its role:
learn first, decide together, then build.

## Rules

- **The pause before reading is non-negotiable.** Reading sources without confirmation skips the user's only chance to
  redirect. They know context the skill doesn't — relevance to their actual goal, time budget, what they've already
  explored. Bypassing the pause hijacks that judgment.

- **Every source the user confirmed gets read.** Selectivity happens during evaluation (step 2), which the user reviews.
  Once they say "go", skipping the harder sources biases what gets learned and undermines the agreed plan. If something
  turns out to be irrelevant, document it in synthesis — don't drop it silently.

- **Tests are the highest-value artifact in any source.** Implementations show what works; tests show what the authors
  knew could go wrong. Edge cases, error paths, invariants — that's the institutional knowledge worth distilling.

- **Distill patterns, don't copy code.** Sources may use different runtimes, languages, or scales. Copying produces code
  that doesn't fit. Distilling produces code that does, and avoids licensing risk that verbatim reuse creates.

- **Selectivity is a step-2 concern, not a step-3 concern.** Filtering out a confirmed source mid-read silently changes
  what was agreed. Filter during evaluation; once confirmed, read.

- **Prefer runtime primitives over ports of low-level patterns.** When a source uses C-level structures and the project
  runs on a high-level runtime, the runtime usually has a built-in equivalent (a stream primitive instead of a manual
  ring buffer, an event target instead of an intrusive list). Using the primitive produces idiomatic code; porting
  produces code that fights the runtime.

- **A documented miss beats a silent skip.** If a source had nothing relevant after honest browsing, say so in the
  synthesis. Hiding it makes future sessions repeat the same wasted exploration.
