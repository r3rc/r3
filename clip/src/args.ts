import { cyan } from "@std/fmt/colors";
import { toCamelCase, toKebabCase } from "@std/text";
import { type ParseOptions, parseRawArgs } from "./_parser.ts";
import { CLIError, toArray } from "./_utils.ts";
import type { Arg, ArgsDef, ParsedArgs } from "./types.ts";

export function parseArgs<T extends ArgsDef = ArgsDef>(rawArgs: string[], argsDef: ArgsDef): ParsedArgs<T> {
    const parseOptions = {
        boolean: [] as string[],
        string: [] as string[],
        negatable: [] as string[],
        alias: {} as Record<string, string[]>,
        default: {} as Record<string, boolean | string>
    } satisfies ParseOptions;

    const args = resolveArgs(argsDef);

    for (const arg of args) {
        if (arg.type === "positional") continue;
        if (arg.type === "string" || arg.type === "enum") {
            parseOptions.string.push(arg.name);
        } else if (arg.type === "boolean") {
            parseOptions.boolean.push(arg.name);
            parseOptions.negatable.push(arg.name);
        }
        if (arg.default !== undefined) {
            parseOptions.default[arg.name] = arg.default as boolean | string;
        }
        if (arg.alias.length > 0) {
            parseOptions.alias[arg.name] = arg.alias;
        }

        // Register camelCase/kebab-case variants so --user-name and --userName are equivalent
        const camelName = toCamelCase(arg.name);
        const kebabName = toKebabCase(arg.name);
        if (camelName !== arg.name || kebabName !== arg.name) {
            const existing = toArray(parseOptions.alias[arg.name]);
            if (camelName !== arg.name && !existing.includes(camelName)) existing.push(camelName);
            if (kebabName !== arg.name && !existing.includes(kebabName)) existing.push(kebabName);
            if (existing.length > 0) parseOptions.alias[arg.name] = existing;
        }
    }

    const parsed = parseRawArgs(rawArgs, parseOptions);
    const positionals = [...(parsed._ as string[])];

    const proxy = new Proxy(parsed as ParsedArgs<ArgsDef>, {
        get(target, prop: string) {
            return (target as Record<string, unknown>)[prop] ??
                (target as Record<string, unknown>)[toCamelCase(prop)] ??
                (target as Record<string, unknown>)[toKebabCase(prop)];
        }
    }) as ParsedArgs<T>;

    for (const arg of args) {
        if (arg.type === "positional") {
            const next = positionals.shift();
            if (next !== undefined) {
                (proxy as Record<string, unknown>)[arg.name] = next;
            } else if (arg.default === undefined && arg.required !== false) {
                throw new CLIError(`Missing required positional argument: ${arg.name.toUpperCase()}`, "EARG");
            } else {
                (proxy as Record<string, unknown>)[arg.name] = arg.default;
            }
        } else if (arg.type === "enum") {
            const value = (proxy as Record<string, unknown>)[arg.name];
            const options = (arg as { options?: string[] }).options ?? [];
            if (value !== undefined && options.length > 0 && !options.includes(value as string)) {
                throw new CLIError(
                    `Invalid value for argument: ${cyan(`--${arg.name}`)} (${cyan(String(value))}). Expected one of: ${
                        options.map((o) => cyan(o)).join(", ")
                    }.`,
                    "EARG"
                );
            }
        } else if (arg.required && (proxy as Record<string, unknown>)[arg.name] === undefined) {
            throw new CLIError(`Missing required argument: --${arg.name}`, "EARG");
        }
    }

    return proxy;
}

export function resolveArgs(argsDef: ArgsDef): Arg[] {
    return Object.entries(argsDef ?? {}).map(([name, argDef]) => ({
        ...argDef,
        name,
        alias: toArray((argDef as { alias?: unknown }).alias)
    }));
}
