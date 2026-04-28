import { cyan } from "@std/fmt/colors";
import { toCamelCase } from "@std/text";
import { CLIError, resolveValue, toArray } from "./_utils.ts";
import { parseArgs } from "./args.ts";
import type { ArgsDef, CommandContext, CommandDef, SubCommandsDef } from "./types.ts";

export function defineCommand<const T extends ArgsDef = ArgsDef>(def: CommandDef<T>): CommandDef<T> {
    return def;
}

export interface RunCommandOptions {
    rawArgs: string[];
    data?: unknown;
}

export async function runCommand<T extends ArgsDef = ArgsDef>(
    cmd: CommandDef<T>,
    opts: RunCommandOptions
): Promise<{ result: unknown }> {
    const cmdArgs = await resolveValue(cmd.args ?? ({} as T));
    const parsedArgs = parseArgs<T>(opts.rawArgs, cmdArgs);

    const context: CommandContext<T> = {
        rawArgs: opts.rawArgs,
        args: parsedArgs,
        data: opts.data,
        cmd
    };

    let result: unknown;
    let runError: unknown;

    try {
        await cmd.setup?.(context);

        const subCommands = await resolveValue(cmd.subCommands);
        if (subCommands && Object.keys(subCommands).length > 0) {
            const subCmdIndex = _findSubCommandIndex(opts.rawArgs, cmdArgs);
            const explicitName = opts.rawArgs[subCmdIndex];

            if (explicitName) {
                const sub = await _findSubCommand(subCommands, explicitName);
                if (!sub) throw new CLIError(`Unknown command ${cyan(explicitName)}`, "E_UNKNOWN_COMMAND");
                await runCommand(sub, { rawArgs: opts.rawArgs.slice(subCmdIndex + 1) });
            } else {
                const defaultName = await resolveValue(cmd.default);
                if (defaultName) {
                    if (cmd.run) {
                        throw new CLIError(
                            "Cannot specify both 'run' and 'default' on the same command.",
                            "E_DEFAULT_CONFLICT"
                        );
                    }
                    const sub = await _findSubCommand(subCommands, defaultName);
                    if (!sub) {
                        throw new CLIError(`Default sub command ${cyan(defaultName)} not found.`, "E_UNKNOWN_COMMAND");
                    }
                    await runCommand(sub, { rawArgs: opts.rawArgs });
                } else if (!cmd.run) {
                    throw new CLIError("No command specified.", "E_NO_COMMAND");
                }
            }
        }

        if (typeof cmd.run === "function") result = await cmd.run(context);
    } catch (error) {
        runError = error;
    }

    try {
        await cmd.cleanup?.(context);
    } catch (cleanupError) {
        if (runError) throw new Error("Multiple errors", { cause: [runError, cleanupError] });
        throw cleanupError;
    }

    if (runError) throw runError;

    return { result };
}

export async function resolveSubCommand<T extends ArgsDef = ArgsDef>(
    cmd: CommandDef<T>,
    rawArgs: string[],
    parent?: CommandDef<T>
): Promise<[CommandDef<T>, CommandDef<T>?]> {
    const subCommands = await resolveValue(cmd.subCommands);
    if (subCommands && Object.keys(subCommands).length > 0) {
        const cmdArgs = await resolveValue(cmd.args ?? ({} as T));
        const idx = _findSubCommandIndex(rawArgs, cmdArgs);
        const name = rawArgs[idx];
        if (name) {
            const sub = await _findSubCommand(subCommands, name);
            if (sub) {
                return resolveSubCommand(sub, rawArgs.slice(idx + 1), cmd as unknown as CommandDef<ArgsDef>) as Promise<
                    [CommandDef<T>, CommandDef<T>?]
                >;
            }
        }
    }
    return [cmd, parent];
}

// --- internal ---

async function _findSubCommand(subCommands: SubCommandsDef, name: string): Promise<CommandDef<ArgsDef> | undefined> {
    if (name in subCommands) return resolveValue(subCommands[name]!);
    for (const sub of Object.values(subCommands)) {
        const resolved = await resolveValue(sub);
        const meta = await resolveValue(resolved?.meta);
        if (meta?.alias && toArray(meta.alias).includes(name)) return resolved;
    }
    return undefined;
}

function _findSubCommandIndex(rawArgs: string[], argsDef: ArgsDef): number {
    for (let i = 0; i < rawArgs.length; i++) {
        const arg = rawArgs[i]!;
        if (arg === "--") return -1;
        if (arg.startsWith("-")) {
            if (!arg.includes("=") && _isValueFlag(arg, argsDef)) i++;
            continue;
        }
        return i;
    }
    return -1;
}

function _isValueFlag(flag: string, argsDef: ArgsDef): boolean {
    const name = toCamelCase(flag.replace(/^-{1,2}/, ""));
    for (const [key, def] of Object.entries(argsDef)) {
        if (def.type !== "string" && def.type !== "enum") continue;
        if (name === toCamelCase(key)) return true;
        const aliases = Array.isArray(def.alias) ? def.alias : def.alias ? [def.alias] : [];
        if (aliases.includes(flag.replace(/^-{1,2}/, ""))) return true;
    }
    return false;
}
