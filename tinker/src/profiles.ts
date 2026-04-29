import { stringify } from "@std/dotenv/stringify";
import { join } from "@std/path";
import * as v from "@valibot/valibot";
import { ensureDir, profilesDir } from "./config.ts";
import { warn } from "./log.ts";
import { activateAgent } from "./ssh.ts";

const ProfileSchema = v.object({
    name: v.string(),
    env: v.optional(v.record(v.string(), v.string()), {}),
    git: v.optional(v.record(v.string(), v.string()), {}),
    ssh: v.optional(v.object({ identityFile: v.optional(v.string()) }))
});

export type Profile = v.InferOutput<typeof ProfileSchema>;

const SECRET_PREFIX = "$secret:";
const VALID_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

function _profilePath(name: string): string {
    return join(profilesDir(), `${name}.json`);
}

// ── validation ────────────────────────────────────────────────────────────────

export function validateProfileName(name: string): void {
    if (!VALID_NAME_RE.test(name)) {
        throw new Error(
            `Invalid profile name "${name}": must start with a letter and contain only [a-zA-Z0-9_-]`
        );
    }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createProfile(name: string): Promise<void> {
    validateProfileName(name);
    await ensureDir(profilesDir());
    const path = _profilePath(name);
    try {
        await Deno.stat(path);
        throw new Error(`Profile "${name}" already exists`);
    } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) throw err;
    }
    await _writeProfileFile({ name, env: {}, git: {} });
}

export async function readProfile(name: string): Promise<Profile> {
    validateProfileName(name);
    let raw: string;
    try {
        raw = await Deno.readTextFile(_profilePath(name));
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) throw new Error(`Profile "${name}" not found`);
        throw err;
    }
    return _parseProfile(raw, name);
}

export async function writeProfile(profile: Profile): Promise<void> {
    validateProfileName(profile.name);
    await ensureDir(profilesDir());
    await _writeProfileFile(profile);
}

export async function deleteProfile(name: string): Promise<void> {
    validateProfileName(name);
    try {
        await Deno.remove(_profilePath(name));
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) throw new Error(`Profile "${name}" not found`);
        throw err;
    }
}

export async function listProfiles(): Promise<string[]> {
    const dir = profilesDir();
    const names: string[] = [];
    try {
        for await (const entry of Deno.readDir(dir)) {
            if (entry.isFile && entry.name.endsWith(".json")) {
                names.push(entry.name.slice(0, -5));
            }
        }
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) return [];
        throw err;
    }
    return names.sort();
}

// ── var / git mutation ────────────────────────────────────────────────────────

export async function setVar(profileName: string, key: string, value: string): Promise<void> {
    const profile = await readProfile(profileName);
    profile.env[key] = value;
    await _writeProfileFile(profile);
}

export async function removeVar(profileName: string, key: string): Promise<void> {
    const profile = await readProfile(profileName);
    delete profile.env[key];
    await _writeProfileFile(profile);
}

export async function setGitConfig(profileName: string, key: string, value: string): Promise<void> {
    const profile = await readProfile(profileName);
    profile.git[key] = value;
    await _writeProfileFile(profile);
}

export async function removeGitConfig(profileName: string, key: string): Promise<void> {
    const profile = await readProfile(profileName);
    delete profile.git[key];
    await _writeProfileFile(profile);
}

export async function setSshKey(profileName: string, identityFile: string): Promise<void> {
    const profile = await readProfile(profileName);
    profile.ssh = { ...(profile.ssh ?? {}), identityFile };
    await _writeProfileFile(profile);
}

export async function removeSshKey(profileName: string): Promise<void> {
    const profile = await readProfile(profileName);
    profile.ssh = undefined;
    await _writeProfileFile(profile);
}

// ── apply ─────────────────────────────────────────────────────────────────────

export async function applyProfile(
    name: string,
    resolveSecret?: (ref: string) => Promise<string>
): Promise<string[]> {
    const profile = await readProfile(name);

    // Resolve env vars, expanding $secret: references
    const resolved: Record<string, string> = {};
    for (const [k, v] of Object.entries(profile.env)) {
        if (v.startsWith(SECRET_PREFIX)) {
            const ref = v.slice(SECRET_PREFIX.length);
            if (!resolveSecret) {
                warn(`skipping ${k} — no secret resolver provided`);
                continue;
            }
            resolved[k] = await resolveSecret(ref);
        } else {
            resolved[k] = v;
        }
    }
    resolved["TINKER_PROFILE"] = name;

    await _applyGitConfig(profile.git);

    if (profile.ssh?.identityFile) {
        const agentVars = await activateAgent(profile.name, profile.ssh.identityFile);
        resolved["SSH_AUTH_SOCK"] = agentVars.SSH_AUTH_SOCK;
        resolved["SSH_AGENT_PID"] = agentVars.SSH_AGENT_PID;
    }

    return stringify(resolved)
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => `export ${line}`);
}

export function hasSecretRefs(profile: Profile): boolean {
    return Object.values(profile.env).some((v) => v.startsWith(SECRET_PREFIX));
}

// ── internal ──────────────────────────────────────────────────────────────────

async function _writeProfileFile(profile: Profile): Promise<void> {
    const path = _profilePath(profile.name);
    const tmpPath = path + ".tmp";
    await Deno.writeTextFile(tmpPath, JSON.stringify(profile, null, 4) + "\n");
    await Deno.rename(tmpPath, path);
}

function _parseProfile(raw: string, name: string): Profile {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(`Profile "${name}" has invalid JSON`);
    }
    const result = v.safeParse(ProfileSchema, parsed);
    if (!result.success) {
        throw new Error(
            `Profile "${name}" has invalid format: ${v.flatten(result.issues).root ?? JSON.stringify(result.issues)}`
        );
    }
    return result.output;
}

async function _applyGitConfig(git: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(git)) {
        const cmd = new Deno.Command("git", {
            args: ["config", "--global", key, value],
            stdout: "null",
            stderr: "piped"
        });
        const { success, stderr } = await cmd.output();
        if (!success) {
            const msg = new TextDecoder().decode(stderr).trim();
            warn(`git config --global ${key} failed: ${msg}`);
        }
    }
}
