---
name: deno test/fmt/lint exclusions
description: .tinker/ and .claude/ are excluded from deno fmt/lint/test in root deno.json
type: project
---

Root `deno.json` excludes `.tinker/` from lint and test, and `.tinker/` + `.claude/` from fmt.

**Why:** `.tinker/sources/` contains clones of external repos (citty, deno-std, linux) with their own test suites and formatting conventions. Including them would pollute the quality gate. `.claude/settings.local.json` uses 2-space indentation that conflicts with the project's 4-space fmt config.

**How to apply:** If tests or lint start picking up source files unexpectedly, check the `exclude` sections in root `deno.json`.
