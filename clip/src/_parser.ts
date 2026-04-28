import { parseArgs } from "@std/cli/parse-args";

export interface ParseOptions {
    boolean?: string[];
    string?: string[];
    negatable?: string[];
    alias?: Record<string, string | string[]>;
    default?: Record<string, boolean | string>;
}

export type Argv = { _: string[]; [key: string]: unknown };

export function parseRawArgs(args: string[] = [], opts: ParseOptions = {}): Argv {
    return parseArgs(args, {
        boolean: opts.boolean,
        string: opts.string,
        negatable: opts.negatable,
        alias: opts.alias,
        default: opts.default
    }) as unknown as Argv;
}
