import { type ArgsDef, type CommandDef, defineCommand } from "@unjs/citty";
import { findProjectRoot } from "src/config.ts";
import { bold, cyan, dim, done, fail, gray, green, pending, red } from "src/log.ts";
import { addSource, listSources, nameFromUrl, removeSource, syncSource } from "src/sources.ts";

const listCmd = defineCommand({
    meta: { name: "list", description: "List reference sources for this project" },
    async run() {
        const projectDir = await findProjectRoot();
        const sources = await listSources(projectDir);

        if (sources.length === 0) {
            dim("No sources configured. Use `tinker sources add <url>` to add one.");
            return;
        }

        for (const s of sources) {
            const cloned = s.cloned ? green("✓") : red("✗");
            const linked = s.linked ? green("✓") : red("✗");
            const sha = s.sha ? gray(` @ ${s.sha}`) : "";
            console.log(`${cloned} ${linked} ${bold(s.name)}${sha}  ${gray(s.url)}`);
        }
    }
});

const addCmd = defineCommand({
    meta: { name: "add", description: "Add a reference source and clone it" },
    args: {
        url: { type: "positional", description: "Git URL to clone", required: true },
        name: { type: "string", description: "Override the source name (default: derived from URL)", alias: "n" }
    },
    async run({ args }) {
        const projectDir = await findProjectRoot();
        const name = args.name ?? nameFromUrl(args.url!);
        await pending(`Adding ${bold(cyan(name))}...`);
        try {
            await addSource(args.url!, projectDir, name);
            done();
        } catch (err) {
            fail(err instanceof Error ? err.message : String(err));
            Deno.exit(1);
        }
    }
});

const removeCmd = defineCommand({
    meta: { name: "remove", description: "Remove a source from this project", alias: ["rm"] },
    args: {
        name: { type: "positional", description: "Name of the source to remove", required: true }
    },
    async run({ args }) {
        const projectDir = await findProjectRoot();
        await removeSource(args.name!, projectDir);
        console.log(`Removed ${bold(args.name!)}`);
    }
});

const syncCmd = defineCommand({
    meta: { name: "sync", description: "Re-clone all sources (picks up upstream changes)" },
    async run() {
        const projectDir = await findProjectRoot();
        const sources = await listSources(projectDir);

        if (sources.length === 0) {
            dim("No sources to sync.");
            return;
        }

        for (const s of sources) {
            await pending(`Syncing ${bold(cyan(s.name))}...`);
            try {
                await syncSource(s.name, projectDir);
                done();
            } catch (err) {
                fail(err instanceof Error ? err.message : String(err));
            }
        }
    }
});

export const sourcesCmd = defineCommand({
    meta: { name: "sources", description: "Manage reference source repositories" },
    subCommands: {
        list: listCmd as CommandDef<ArgsDef>,
        add: addCmd as CommandDef<ArgsDef>,
        remove: removeCmd as CommandDef<ArgsDef>,
        sync: syncCmd as CommandDef<ArgsDef>
    }
});
