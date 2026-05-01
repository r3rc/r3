#!/usr/bin/env -S deno run --allow-all

import $ from "jsr:@david/dax@^0.43.2";
import { bold, cyan, dim, green } from "jsr:@std/fmt@^1.0.0/colors";
import { defineCommand, runMain } from "npm:citty@0.2.2";

type Args = {
    packageRef: string;
    version: string;
    dryRun: boolean;
    skipChangelog: boolean;
    allowSlowTypes: boolean;
};

type Package = {
    dir: string;
    name: string;
};

const cliffConfig = String.raw`
[changelog]
header = """
# Changelog

All notable changes to this project will be documented in this file.

"""
body = """
{% if version %}\
## [{{ version | trim_start_matches(pat="v") }}] - {{ timestamp | date(format="%Y-%m-%d") }}
{% else %}\
## [unreleased]
{% endif %}\
{% for group, commits in commits | group_by(attribute="group") %}

### {{ group | upper_first }}
{% for commit in commits %}
- {% if commit.scope %}**{{ commit.scope }}:** {% endif %}{{ commit.message | upper_first }}\
{% endfor %}
{% endfor %}\n
"""
trim = true
postprocessors = [
    { pattern = '<REPO>', replace = "https://github.com/r3rc/r3" }
]

[git]
conventional_commits = true
filter_unconventional = true
split_commits = false
commit_preprocessors = [
    { pattern = '\((\w+\s)?#([0-9]+)\)', replace = "([#${2}](<REPO>/issues/${2}))" }
]
commit_parsers = [
    { message = "^feat", group = "Features" },
    { message = "^fix", group = "Bug Fixes" },
    { message = "^doc", group = "Documentation" },
    { message = "^perf", group = "Performance" },
    { message = "^refactor", group = "Refactor" },
    { message = "^style", group = "Styling" },
    { message = "^test", group = "Testing" },
    { message = "^chore\\(release\\): prepare for", skip = true },
    { message = "^chore", group = "Miscellaneous Tasks" },
    { body = ".*security", group = "Security" },
    { message = "^revert", group = "Revert" }
]
protect_breaking_commits = false
filter_commits = false
topo_order = false
sort_commits = "oldest"
`;

if (import.meta.main) {
    await runMain(defineCommand({
        meta: { name: "release", description: "Release a workspace package to JSR" },
        args: {
            "dry-run": { type: "boolean", alias: "n", description: "Preview without making changes" },
            "skip-changelog": { type: "boolean", description: "Skip changelog generation" },
            "allow-slow-types": { type: "boolean", description: "Pass --allow-slow-types to deno publish" },
            package: { type: "positional", description: "Package name or directory", required: true },
            version: { type: "positional", description: "Version to release", required: true }
        },
        run: ({ args }) => release({
            packageRef: args.package,
            version: args.version,
            dryRun: args["dry-run"] ?? false,
            skipChangelog: args["skip-changelog"] ?? false,
            allowSlowTypes: args["allow-slow-types"] ?? false
        })
    }));
}

async function release(args: Args) {
    const pkg = await resolvePackage(args.packageRef);
    const packageDir = pkg.dir;
    const packageJsonPath = `${packageDir}/deno.json`;
    const changelogPath = `${packageDir}/CHANGELOG.md`;
    const packageVersion = normalizePackageVersion(args.version);
    const tag = `${pkg.name}@${formatTagVersion(packageVersion)}`;

    await ensurePackage(packageJsonPath);

    if (args.dryRun) {
        $.logStep("dry-run", `release ${tag}`);
        await printVersionChange(packageJsonPath, packageVersion);
        await runPublishDryRun({ packageDir, version: packageVersion, allowSlowTypes: args.allowSlowTypes });
        printPublishInstructions(packageDir, args.allowSlowTypes);
        return;
    }

    $.logStep("version", `${packageJsonPath} -> ${packageVersion}`);
    await writePackageVersion(packageJsonPath, packageVersion);

    if (args.skipChangelog) {
        $.logStep("changelog", "skipped");
    } else {
        $.logStep("changelog", changelogPath);
        await runGitCliff({ packageDir, tag, tagPattern: `${pkg.name}@.*`, output: changelogPath });
    }

    $.logStep("git", `commit and tag ${tag}`);
    if (args.skipChangelog) {
        await $`git add ${packageJsonPath}`;
    } else {
        await $`git add ${packageJsonPath} ${changelogPath}`;
    }

    if (await hasStagedChanges()) {
        await $`git commit -m ${`chore(${packageDir}): release ${packageVersion}`}`;
    } else {
        $.logStep("commit", "skipped; no changes staged");
    }

    await ensureTagDoesNotExist(tag);
    await $`git tag -a ${tag} -m ${`release ${tag}`}`;

    printPublishInstructions(packageDir, args.allowSlowTypes);
}

function normalizePackageVersion(version: string) {
    return version.startsWith("v") ? version.slice(1) : version;
}

function formatTagVersion(version: string) {
    return `v${version}`;
}

async function resolvePackage(packageRef: string): Promise<Package> {
    const normalized = normalizePackageRef(packageRef);
    const workspaces = await readWorkspaces();

    for (const dir of workspaces) {
        const denoJsonPath = `${dir}/deno.json`;
        const cfg = await readPackageJson(denoJsonPath).catch((error) => {
            if (error instanceof Deno.errors.NotFound) {
                return undefined;
            }

            throw error;
        });

        if (!cfg) {
            continue;
        }

        const name = cfg.name;

        if (typeof name !== "string") {
            continue;
        }

        if (normalized === dir || normalized === name) {
            return { dir, name };
        }
    }

    throw new Error(`package not found in workspace: ${packageRef}`);
}

async function readWorkspaces() {
    const root = await readPackageJson("deno.json");
    const workspace = root.workspace;

    if (!Array.isArray(workspace)) {
        throw new Error("root deno.json does not define a workspace");
    }

    return workspace.map((entry) => normalizePackageRef(String(entry)));
}

function normalizePackageRef(packageRef: string) {
    const normalized = packageRef.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "");

    if (!normalized || normalized === "." || normalized.includes("..") || normalized.startsWith("/")) {
        throw new Error(`invalid package: ${packageRef}`);
    }

    return normalized;
}

async function ensurePackage(packageJsonPath: string) {
    const info = await Deno.stat(packageJsonPath).catch((error) => {
        if (error instanceof Deno.errors.NotFound) {
            throw new Error(`${packageJsonPath} does not exist`);
        }

        throw error;
    });

    if (!info.isFile) {
        throw new Error(`${packageJsonPath} is not a file`);
    }
}

async function hasStagedChanges() {
    const { code } = await $`git diff --cached --quiet`.noThrow();

    if (code === 0) return false;
    if (code === 1) return true;

    throw new Error(`failed to inspect staged changes: git diff exited with ${code}`);
}

async function ensureTagDoesNotExist(tag: string) {
    const { code } = await $`git rev-parse --verify --quiet ${"refs/tags/" + tag}`.noThrow();

    if (code === 1) return;
    if (code === 0) throw new Error(`tag already exists: ${tag}`);

    throw new Error(`failed to inspect tag ${tag}: git rev-parse exited with ${code}`);
}

async function printVersionChange(packageJsonPath: string, version: string) {
    const cfg = await readPackageJson(packageJsonPath);
    const previous = cfg.version;

    console.log(`${packageJsonPath}: ${dim(String(previous ?? "(no version)"))} -> ${green(version)}`);
}

async function writePackageVersion(packageJsonPath: string, version: string) {
    const cfg = await readPackageJson(packageJsonPath);
    cfg.version = version;
    await Deno.writeTextFile(packageJsonPath, `${JSON.stringify(cfg, null, 4)}\n`);
}

async function readPackageJson(packageJsonPath: string) {
    const text = await Deno.readTextFile(packageJsonPath);
    const parsed = JSON.parse(text) as Record<string, unknown>;

    return parsed;
}

async function runGitCliff(args: { packageDir: string; tag: string; tagPattern: string; output?: string }) {
    const includePath = `${args.packageDir}/**`;
    const configPath = await writeTempCliffConfig();
    const outputArgs = args.output ? ["--output", args.output] : [];

    try {
        await $`git-cliff --config ${configPath} --tag ${args.tag} --tag-pattern ${args.tagPattern} --include-path ${includePath} ${outputArgs}`;
    } finally {
        await Deno.remove(configPath).catch(() => {});
    }
}

async function runPublishDryRun(args: { packageDir: string; version: string; allowSlowTypes: boolean }) {
    $.logStep("publish", "dry-run");
    const slowTypesArgs = args.allowSlowTypes ? ["--allow-slow-types"] : [];
    await $`deno publish --dry-run --allow-dirty --set-version ${args.version} ${slowTypesArgs}`.cwd(args.packageDir);
}

async function writeTempCliffConfig() {
    const path = await Deno.makeTempFile({ prefix: "r3-git-cliff-", suffix: ".toml" });
    await Deno.writeTextFile(path, cliffConfig.trimStart());

    return path;
}

function printPublishInstructions(packageDir: string, allowSlowTypes: boolean) {
    const publishCmd = allowSlowTypes ? "deno publish --allow-slow-types" : "deno publish";
    console.log("");
    console.log(bold("To publish:"));
    console.log(`  ${cyan("git push && git push --tags")}`);
    console.log(`  ${cyan(`cd ${packageDir} && ${publishCmd}`)}`);
}
