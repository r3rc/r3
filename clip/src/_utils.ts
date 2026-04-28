import type { Resolvable } from "./types.ts";

export function toArray(val: unknown): string[] {
    if (Array.isArray(val)) return val as string[];
    return val === undefined ? [] : [val as string];
}

export function formatLineColumns(lines: string[][], linePrefix = ""): string {
    const maxLength: number[] = [];
    for (const line of lines) {
        for (const [i, element] of line.entries()) {
            maxLength[i] = Math.max(maxLength[i] ?? 0, element.length);
        }
    }
    return lines
        .map((l) => l.map((c, i) => linePrefix + c[i === 0 ? "padStart" : "padEnd"](maxLength[i] ?? 0)).join("  "))
        .join("\n");
}

export function resolveValue<T>(input: Resolvable<T>): T | Promise<T> {
    return typeof input === "function" ? (input as () => T | Promise<T>)() : input;
}

export class CLIError extends Error {
    code: string | undefined;
    constructor(message: string, code?: string) {
        super(message);
        this.name = "CLIError";
        this.code = code;
    }
}
