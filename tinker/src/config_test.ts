import { assertEquals, assertRejects } from "@std/assert";
import { findProjectRoot, readConfig, writeConfig } from "./config.ts";

Deno.test("readConfig returns empty sources when file missing", async () => {
    const tmp = await Deno.makeTempDir();
    try {
        const config = await readConfig(tmp);
        assertEquals(config, { sources: {} });
    } finally {
        await Deno.remove(tmp, { recursive: true });
    }
});

Deno.test("writeConfig + readConfig round-trips sources", async () => {
    const tmp = await Deno.makeTempDir();
    try {
        const original = {
            sources: { citty: "https://github.com/unjs/citty.git", std: "https://github.com/denoland/deno_std.git" }
        };
        await writeConfig(tmp, original);
        const loaded = await readConfig(tmp);
        assertEquals(loaded, original);
    } finally {
        await Deno.remove(tmp, { recursive: true });
    }
});

Deno.test("writeConfig is atomic — uses tmp file then renames", async () => {
    const tmp = await Deno.makeTempDir();
    try {
        await writeConfig(tmp, { sources: { a: "https://example.com/a" } });
        const configPath = `${tmp}/.tinker/config.json`;
        const tmpPath = configPath + ".tmp";
        await assertEquals((await Deno.stat(configPath)).isFile, true);
        await assertRejects(() => Deno.stat(tmpPath), Deno.errors.NotFound);
    } finally {
        await Deno.remove(tmp, { recursive: true });
    }
});

Deno.test("writeConfig overwrites existing config", async () => {
    const tmp = await Deno.makeTempDir();
    try {
        await writeConfig(tmp, { sources: { old: "https://example.com/old" } });
        await writeConfig(tmp, { sources: { new: "https://example.com/new" } });
        const config = await readConfig(tmp);
        assertEquals(config, { sources: { new: "https://example.com/new" } });
    } finally {
        await Deno.remove(tmp, { recursive: true });
    }
});

Deno.test("readConfig throws on invalid schema", async () => {
    const tmp = await Deno.makeTempDir();
    try {
        await Deno.mkdir(`${tmp}/.tinker`, { recursive: true });
        await Deno.writeTextFile(
            `${tmp}/.tinker/config.json`,
            JSON.stringify({ sources: { valid: "https://example.com", invalid: 42 } })
        );
        await assertRejects(() => readConfig(tmp), Error, "Invalid tinker config");
    } finally {
        await Deno.remove(tmp, { recursive: true });
    }
});

Deno.test("findProjectRoot finds dir with .git", async () => {
    const tmp = await Deno.makeTempDir();
    try {
        await Deno.mkdir(`${tmp}/.git`);
        const sub = `${tmp}/a/b`;
        await Deno.mkdir(sub, { recursive: true });
        const root = await findProjectRoot(sub);
        assertEquals(root, tmp);
    } finally {
        await Deno.remove(tmp, { recursive: true });
    }
});

Deno.test("findProjectRoot finds dir with .tinker", async () => {
    const tmp = await Deno.makeTempDir();
    try {
        await Deno.mkdir(`${tmp}/.tinker`);
        const sub = `${tmp}/x`;
        await Deno.mkdir(sub, { recursive: true });
        const root = await findProjectRoot(sub);
        assertEquals(root, tmp);
    } finally {
        await Deno.remove(tmp, { recursive: true });
    }
});

Deno.test("findProjectRoot returns startDir when no marker found", async () => {
    const tmp = await Deno.makeTempDir();
    try {
        const sub = `${tmp}/no/markers/here`;
        await Deno.mkdir(sub, { recursive: true });
        const root = await findProjectRoot(sub);
        assertEquals(root, sub);
    } finally {
        await Deno.remove(tmp, { recursive: true });
    }
});
