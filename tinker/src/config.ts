import { dirname, join } from "@std/path";
import * as v from "@valibot/valibot";

const TinkerConfigSchema = v.object({
    sources: v.optional(v.record(v.string(), v.string()), {})
});

export type TinkerConfig = v.InferOutput<typeof TinkerConfigSchema>;

const CONFIG_FILENAME = "config.json";
const TINKER_DIR = ".tinker";

export function homeDir(): string {
    const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
    if (!home) throw new Error("Cannot determine home directory: HOME and USERPROFILE are both unset");
    return home;
}

export async function findProjectRoot(startDir: string = Deno.cwd()): Promise<string> {
    let current = startDir;
    while (true) {
        for (const marker of [TINKER_DIR, ".git"]) {
            try {
                const stat = await Deno.stat(join(current, marker));
                if (stat.isDirectory) return current;
            } catch {
                // not found — keep walking
            }
        }
        const parent = dirname(current);
        if (parent === current) return startDir;
        current = parent;
    }
}

export function globalTinkerDir(): string {
    return join(homeDir(), TINKER_DIR);
}

export function globalSourcesDir(): string {
    return join(globalTinkerDir(), "sources");
}

export function secretsDir(): string {
    return join(globalTinkerDir(), "secrets");
}

export function profilesDir(): string {
    return join(globalTinkerDir(), "profiles");
}

export function sshDir(): string {
    return join(globalTinkerDir(), "ssh");
}

export function projectTinkerDir(projectDir: string): string {
    return join(projectDir, TINKER_DIR);
}

export async function ensureDir(path: string): Promise<void> {
    await Deno.mkdir(path, { recursive: true });
}

export async function readConfig(projectDir: string): Promise<TinkerConfig> {
    const configPath = join(projectDir, TINKER_DIR, CONFIG_FILENAME);
    let raw: string;
    try {
        raw = await Deno.readTextFile(configPath);
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) return { sources: {} };
        throw err;
    }
    const parsed: unknown = JSON.parse(raw);
    const result = v.safeParse(TinkerConfigSchema, parsed);
    if (!result.success) {
        throw new Error(`Invalid tinker config: ${v.flatten(result.issues).root ?? JSON.stringify(result.issues)}`);
    }
    return result.output;
}

export async function writeConfig(projectDir: string, config: TinkerConfig): Promise<void> {
    const tinkerDir = join(projectDir, TINKER_DIR);
    await ensureDir(tinkerDir);
    const configPath = join(tinkerDir, CONFIG_FILENAME);
    const tmpPath = join(tinkerDir, CONFIG_FILENAME + ".tmp");
    await Deno.writeTextFile(tmpPath, JSON.stringify(config, null, 4) + "\n");
    await Deno.rename(tmpPath, configPath);
}
