# @r3/clip

Minimal CLI framework for Deno. Type-safe commands, subcommands, and arguments with zero runtime dependencies beyond
`@std`.

## Why

Cliffy is feature-rich but heavy. Commander assumes Node. clip is the lightweight middle ground: Deno-native,
dependency-light, and fully type-inferred — `args.name` resolves to `string` and `args.loud` to `boolean | undefined`
without manual generics.

## Usage

```ts
import { defineCommand, runMain } from "@r3/clip";

const rootCmd = defineCommand({
    meta: { name: "greet", version: "1.0.0", description: "A greeting CLI" },
    args: {
        name: { type: "positional", description: "Name to greet", required: true },
        loud: { type: "boolean", description: "Shout it", alias: "l" }
    },
    run({ args }) {
        const msg = `Hello, ${args.name}!`;
        console.log(args.loud ? msg.toUpperCase() : msg);
    }
});

await runMain(rootCmd);
```

## Argument types

| Type         | Example                                          |
| ------------ | ------------------------------------------------ |
| `positional` | `{ type: "positional", required: true }`         |
| `string`     | `{ type: "string", alias: "o", default: "out" }` |
| `boolean`    | `{ type: "boolean", alias: "v" }`                |
| `enum`       | `{ type: "enum", options: ["a", "b", "c"] }`     |

Parsed args are fully typed — `args.name` is `string`, `args.loud` is `boolean | undefined`, etc.

## Subcommands

```ts
const rootCmd = defineCommand({
    meta: { name: "mycli" },
    subCommands: {
        build: buildCmd,
        deploy: deployCmd
    }
});
```

Subcommand names can have aliases: `alias: ["rm"]` on the meta makes `remove` also respond to `rm`.

## Lifecycle

Each command supports optional `setup` and `cleanup` hooks. `cleanup` always runs, even when `run` throws.

```ts
defineCommand({
    async setup(ctx) {/* runs before run */},
    async run(ctx) {/* main logic */},
    async cleanup(ctx) {/* always runs after */}
});
```

## API

```ts
defineCommand(def)            // identity — gives TypeScript the full generic type
runMain(cmd, opts?)           // parse Deno.args and run, handles errors and exit codes
runCommand(cmd, { rawArgs })  // lower-level runner, returns { result }
parseArgs(rawArgs, argsDef)   // parse a string[] into a typed ParsedArgs object
renderUsage(cmd)              // returns the usage string for a command
```
