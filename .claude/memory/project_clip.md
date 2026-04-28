---
name: clip package
description: clip is a minimalist Deno port of citty (CLI builder). Lives at ./clip, consumed by tinker.
type: project
---

clip is a lightweight CLI argument parsing library, a Deno adaptation of citty.

**Why:** tinker needs a CLI builder; clip replaces citty's Node.js dependencies with Deno-native equivalents — no scule, no node:util.

**Key design decisions:**
- Case conversion (`toCamelCase`, `toKebabCase`, `toSnakeCase`) from `@std/text` — no custom `_case.ts`
- Color helpers (`bold`, `cyan`, `gray`, `underline`, etc.) from `@std/fmt/colors` — no custom `_color.ts`
- Arg parser from `@std/cli/parse-args`; `negatable` option handles `--no-flag` natively — no custom low-level parser
- Replaces `process.argv`/`process.exit`/`process.env` with `Deno.args`/`Deno.exit`/`Deno.env`/`Deno.noColor`
- Script name fallback uses `Deno.mainModule` instead of `process.argv[1]`
- `CittyPlugin` renamed to `CliPlugin`; `defineCittyPlugin` renamed to `definePlugin`
- Custom code only: `_parser.ts` (thin @std/cli wrapper), `_utils.ts` (toArray, formatLineColumns, resolveValue, CLIError)

**How to apply:** When extending clip or debugging CLI parsing in tinker, refer to `.tinker/sources/citty/` as the upstream reference.
