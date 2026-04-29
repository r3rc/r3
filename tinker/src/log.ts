import { bold, cyan, gray, green, red } from "@std/fmt/colors";

export { bold, cyan, gray, green, red };

export function warn(message: string): void {
    console.warn(`warning: ${message}`);
}

export function dim(message: string): void {
    console.log(gray(message));
}

export function fatal(message: string): never {
    console.error(red(message));
    Deno.exit(1);
}

export async function pending(message: string): Promise<void> {
    await Deno.stdout.write(new TextEncoder().encode(message));
}

export function done(): void {
    console.log(` ${green("done")}`);
}

export function fail(message?: string): void {
    console.log(` ${red("failed")}`);
    if (message) console.error(message);
}

export async function promptPin(message: string): Promise<string> {
    await Deno.stdout.write(new TextEncoder().encode(message));
    const isTerminal = Deno.stdin.isTerminal();
    if (isTerminal) Deno.stdin.setRaw(true, { cbreak: true });
    const chars: string[] = [];
    const buf = new Uint8Array(1);
    try {
        while (true) {
            const n = await Deno.stdin.read(buf);
            if (n === null || buf[0] === 13 || buf[0] === 10) break;
            if (buf[0] === 127 || buf[0] === 8) {
                chars.pop();
            } else if (buf[0] !== undefined && buf[0] >= 32) {
                chars.push(String.fromCharCode(buf[0]));
            }
        }
    } finally {
        if (isTerminal) Deno.stdin.setRaw(false);
    }
    console.log();
    return chars.join("");
}
