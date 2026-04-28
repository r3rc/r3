import { CLIError, resolveValue, toArray } from "./_utils.ts";
import { resolveSubCommand, runCommand } from "./command.ts";
import type { ArgsDef, CommandDef } from "./types.ts";
import { showUsage as _showUsage } from "./usage.ts";

export interface RunMainOptions {
    rawArgs?: string[];
    showUsage?: typeof _showUsage;
}

export async function runMain<T extends ArgsDef = ArgsDef>(cmd: CommandDef<T>, opts: RunMainOptions = {}) {
    const rawArgs = opts.rawArgs ?? [...Deno.args];
    const showUsage = opts.showUsage ?? _showUsage;

    try {
        const builtin = await _resolveBuiltinFlags(cmd);

        if (builtin.help.length > 0 && rawArgs.some((arg) => builtin.help.includes(arg))) {
            await showUsage(...(await resolveSubCommand(cmd, rawArgs)));
            Deno.exit(0);
        } else if (rawArgs.length === 1 && builtin.version.includes(rawArgs[0]!)) {
            const meta = await resolveValue(cmd.meta);
            if (!meta?.version) throw new CLIError("No version specified", "E_NO_VERSION");
            console.log(meta.version);
        } else {
            await runCommand(cmd, { rawArgs });
        }
    } catch (error: unknown) {
        if (error instanceof CLIError) {
            await showUsage(...(await resolveSubCommand(cmd, rawArgs)));
            console.error((error as Error).message);
        } else {
            console.error(error, "\n");
        }
        Deno.exit(1);
    }
}

export function createMain<T extends ArgsDef = ArgsDef>(
    cmd: CommandDef<T>
): (opts?: RunMainOptions) => Promise<void> {
    return (opts: RunMainOptions = {}) => runMain(cmd, opts);
}

// --- internal ---

async function _resolveBuiltinFlags<T extends ArgsDef>(
    cmd: CommandDef<T>
): Promise<{ help: string[]; version: string[] }> {
    const argsDef = await resolveValue(cmd.args ?? ({} as ArgsDef));
    const userNames = new Set<string>();
    const userAliases = new Set<string>();
    for (const [name, def] of Object.entries(argsDef)) {
        userNames.add(name);
        for (const alias of toArray((def as { alias?: unknown }).alias)) {
            userAliases.add(alias);
        }
    }
    return {
        help: _getBuiltinFlags("help", "h", userNames, userAliases),
        version: _getBuiltinFlags("version", "v", userNames, userAliases)
    };
}

function _getBuiltinFlags(long: string, short: string, userNames: Set<string>, userAliases: Set<string>): string[] {
    if (userNames.has(long) || userAliases.has(long)) return [];
    if (userNames.has(short) || userAliases.has(short)) return [`--${long}`];
    return [`--${long}`, `-${short}`];
}
