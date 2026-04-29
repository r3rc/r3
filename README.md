# r3

Personal AI partner and workspace toolkit. Deno monorepo.

> Built around a simple thesis: a workstation should be programmable, secrets should stay local, and an AI partner
> should know the codebase without re-explanation every session.

**Status**: Active development. `@r3/clip` and `@r3/tinker` are usable. `@r3/jarvis` is in design.

## Packages

| Package                  | Description                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| [`@r3/clip`](./clip)     | Minimal CLI framework — type-safe commands, subcommands, and args                        |
| [`@r3/tinker`](./tinker) | Workspace toolkit — reference sources, encrypted secrets, environment profiles, SSH keys |
| `@r3/jarvis`             | AI partner with relational intelligence _(in development)_                               |

## Development

```sh
# Run quality gates
deno fmt --check
deno lint
deno check **/*.ts
deno test --allow-all

# Run tinker CLI
deno task tinker --help
```

## Quality gates

| Step       | Command                 | Type    |
| ---------- | ----------------------- | ------- |
| Format     | `deno fmt --check`      | warning |
| Lint       | `deno lint`             | blocker |
| Type check | `deno check **/*.ts`    | blocker |
| Tests      | `deno test --allow-all` | blocker |

## License

MIT — see [LICENSE](./LICENSE).
