# r3

Personal AI partner and workspace toolkit.

## Overview

This repository contains two programs:

- **Jarvis** — AI partner with relational intelligence. Runs as a daemon and exposes a CLI consumer.
- **Tinker** — Workspace toolkit. Standalone CLI for reference sources, encrypted secrets, environment profiles, and
  SSH.

Both live in the same workspace, share the same conventions, and are built with the same toolchain.

## Quality gates

The `preflight` skill runs these in order. **This table is the authoritative source for what runs in the quality gate**
— `deno-skills` recommendations about formatting, linting, or testing are informational, not gates. Steps marked
`blocker` halt the gate (later steps are reported as blocked). Steps marked `warning` are reported but do not halt.

| Step       | Command                 | Type    |
| ---------- | ----------------------- | ------- |
| Format     | `deno fmt --check`      | warning |
| Lint       | `deno lint`             | blocker |
| Type check | `deno check **/*.ts`    | blocker |
| Tests      | `deno test --allow-all` | blocker |

## Reference sources

The `learn` skill consults these clones at `.tinker/sources/` before implementing new features.

| Source     | Path                        | Domain                                                                                                                                                     |
| ---------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `citty`    | `.tinker/sources/citty/`    | Minimal CLI framework. CLI command parsing, subcommand structure, option handling, interactive prompts, colorized output.                                  |
| `deno-std` | `.tinker/sources/deno-std/` | Deno standard library. Idiomatic TypeScript APIs, streams, async, FS, encoding, CLI patterns, testing.                                                     |
| `denokv`   | `.tinker/sources/denokv/`   | Deno KV store. Persistent key-value storage design, encryption patterns, ACID semantics, concurrent access patterns.                                       |
| `linux`    | `.tinker/sources/linux/`    | Linux kernel. System design, lifecycle, IPC, error handling, data structures at scale, protocol design. Used as design inspiration, not as code reference. |

## Tooling

The `deno-skills` plugin (`deno-skills@denoland-skills`) is enabled. Two of its skills are relevant here and
auto-trigger in the presence of `deno.json`:

- `deno-guidance` — package management priority (JSR > npm), `deno add`, `deno.json` configuration, CLI workflows.
- `deno-expert` — code review checklist, import anti-patterns, debugging.

The other four (`deno-deploy`, `deno-frontend`, `deno-sandbox`, `deno-project-templates`) are not applicable to this
project. Ignore their recommendations even if they trigger.

**Deltas from `deno-skills` defaults for this project:**

- **Don't drop tool names on every response.** `deno-expert` instructs to mention `deno fmt`, `deno lint`, and
  `deno test` "in every response that involves Deno code." Skip that here — `preflight` is the quality-gate contract,
  and conversational responses don't need the recommendation tail. Tool names are still fine when the user is debugging
  a gate failure or explicitly asks how to verify something.

All other `deno-skills` guidance applies as written.

## Conventions

- **Language:** TypeScript on Deno. No Node, no Bun.
- **File names:** `snake_case.ts` for modules.
- **Types:** `PascalCase`. Functions: `camelCase`. Constants: `SCREAMING_SNAKE_CASE`.
- **Errors:** throw for exceptional conditions (corruption, OOM, network down). Return `T | null` for "not found". Use
  richer `Result<T, E>`-style only when the error flow has multiple branches.
- **Tests:** `*_test.ts` adjacent to the implementation, using `Deno.test`.
- **TS strict:** `noImplicitOverride`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
  `noImplicitReturns`. Inherited via the workspace `deno.json`. Do not relax.
- **Web standards first.** `ReadableStream`, `AbortSignal`, `EventTarget`, `Web Crypto`, `fetch` come from the runtime.
  Reach for `@std/*` next. Add external dependencies last and only with reason.
- **Adding dependencies:** use `deno add jsr:<pkg>` or `deno add npm:<pkg>`. Don't hand-edit the `imports` field in
  `deno.json` — `deno add` keeps the lockfile in sync.
- **Memory is not a source.** Verify APIs against actual source code or official documentation before writing against
  them.

## Running locally

### tinker

```sh
# View available commands
deno task tinker --help

# Examples:
deno task tinker sources list
deno task tinker secrets set API_KEY my-secret
deno task tinker profiles create work
deno task tinker ssh gen-key work
```

See [`tinker/README.md`](./tinker/README.md) for detailed usage.

### jarvis

_In design. Not yet runnable._
