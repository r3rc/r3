import { basename, join } from "@std/path";
import { ensureDir, globalSourcesDir, projectTinkerDir, readConfig, writeConfig } from "./config.ts";
import { cloneShallow, diagnoseError, headSha } from "./git.ts";

export interface SourceStatus {
    name: string;
    url: string;
    cloned: boolean;
    linked: boolean;
    sha: string | undefined;
}

export function nameFromUrl(url: string): string {
    const stripped = url.endsWith(".git") ? url.slice(0, -4) : url;
    return basename(stripped);
}

export async function listSources(projectDir: string): Promise<SourceStatus[]> {
    const config = await readConfig(projectDir);
    const global = globalSourcesDir();
    const linkDir = join(projectTinkerDir(projectDir), "sources");

    return Promise.all(
        Object.entries(config.sources).map(async ([name, url]) => {
            const globalPath = join(global, name);
            const linkPath = join(linkDir, name);

            let cloned = false;
            try {
                const stat = await Deno.stat(globalPath);
                cloned = stat.isDirectory;
            } catch {
                // not found
            }

            let linked = false;
            try {
                await Deno.lstat(linkPath);
                linked = true;
            } catch {
                // not found
            }

            let sha: string | undefined;
            if (cloned) {
                try {
                    sha = await headSha(globalPath);
                } catch {
                    // ignore
                }
            }

            return { name, url, cloned, linked, sha };
        })
    );
}

export async function addSource(url: string, projectDir: string, name?: string): Promise<void> {
    const resolved = name ?? nameFromUrl(url);
    const config = await readConfig(projectDir);
    config.sources[resolved] = url;
    await writeConfig(projectDir, config);
    await _resolveSource(resolved, url, projectDir);
}

export async function removeSource(name: string, projectDir: string): Promise<void> {
    const config = await readConfig(projectDir);
    delete config.sources[name];
    await writeConfig(projectDir, config);
    const linkPath = join(projectTinkerDir(projectDir), "sources", name);
    try {
        await Deno.remove(linkPath);
    } catch {
        // already gone
    }
}

export async function syncSource(name: string, projectDir: string): Promise<void> {
    const config = await readConfig(projectDir);
    const url = config.sources[name];
    if (!url) throw new Error(`Source "${name}" not found in config`);
    await _syncSource(name, url, projectDir);
}

export async function syncSources(projectDir: string): Promise<void> {
    const config = await readConfig(projectDir);
    for (const [name, url] of Object.entries(config.sources)) {
        await _syncSource(name, url, projectDir);
    }
}

// ── internal ──────────────────────────────────────────────────────────────────

async function _resolveSource(name: string, url: string, projectDir: string): Promise<void> {
    await _cloneSource(name, url);
    await _linkSource(name, projectDir);
}

async function _cloneSource(name: string, url: string): Promise<void> {
    const dest = join(globalSourcesDir(), name);
    try {
        const stat = await Deno.stat(dest);
        if (stat.isDirectory) return;
    } catch {
        // not cached — clone it
    }

    await ensureDir(globalSourcesDir());
    const result = await cloneShallow(url, dest);
    if (!result.success) {
        try {
            await Deno.remove(dest, { recursive: true });
        } catch {
            // best-effort cleanup
        }
        const hint = diagnoseError(result.stderr);
        throw new Error(`Failed to clone ${url}: ${result.stderr.trim()}\nHint: ${hint}`);
    }
}

async function _linkSource(name: string, projectDir: string): Promise<void> {
    const global = join(globalSourcesDir(), name);
    const linkDir = join(projectTinkerDir(projectDir), "sources");
    const linkPath = join(linkDir, name);

    await ensureDir(linkDir);

    try {
        await Deno.remove(linkPath);
    } catch {
        // not there — nothing to remove
    }

    await Deno.symlink(global, linkPath);
}

async function _syncSource(name: string, url: string, projectDir: string): Promise<void> {
    const dest = join(globalSourcesDir(), name);
    try {
        await Deno.remove(dest, { recursive: true });
    } catch {
        // not cached — fine
    }
    await _resolveSource(name, url, projectDir);
}
