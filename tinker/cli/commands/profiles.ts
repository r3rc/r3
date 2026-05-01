import { type ArgsDef, type CommandDef, defineCommand } from "@unjs/citty";
import { bold, cyan, dim, gray, promptPin } from "src/log.ts";
import {
    applyProfile,
    createProfile,
    deleteProfile,
    hasSecretRefs,
    listProfiles,
    readProfile,
    removeGitConfig,
    removeSshKey,
    removeVar,
    setGitConfig,
    setSshKey,
    setVar
} from "src/profiles.ts";
import { deriveKey, getSecret, loadOrCreateSalt } from "src/secrets.ts";

const createCmd = defineCommand({
    meta: { name: "create", description: "Create a new empty profile" },
    args: { name: { type: "positional", description: "Profile name", required: true } },
    async run({ args }) {
        await createProfile(args.name!);
        console.log(`Created profile ${bold(cyan(args.name!))}`);
    }
});

const deleteCmd = defineCommand({
    meta: { name: "delete", description: "Delete a profile", alias: ["rm"] },
    args: { name: { type: "positional", description: "Profile name", required: true } },
    async run({ args }) {
        await deleteProfile(args.name!);
        console.log(`Deleted profile ${bold(args.name!)}`);
    }
});

const listCmd = defineCommand({
    meta: { name: "list", description: "List all profiles" },
    async run() {
        const names = await listProfiles();
        if (names.length === 0) {
            dim("No profiles. Use `tinker profiles create <name>` to add one.");
            return;
        }
        for (const n of names) console.log(bold(n));
    }
});

const showCmd = defineCommand({
    meta: { name: "show", description: "Show a profile's vars, git config, and SSH key" },
    args: { name: { type: "positional", description: "Profile name", required: true } },
    async run({ args }) {
        const profile = await readProfile(args.name!);
        console.log(bold(`Profile: ${profile.name}`));
        if (Object.keys(profile.env).length > 0) {
            console.log(gray("  env:"));
            for (const [k, v] of Object.entries(profile.env)) {
                console.log(`    ${bold(k)} = ${v}`);
            }
        }
        if (Object.keys(profile.git).length > 0) {
            console.log(gray("  git:"));
            for (const [k, v] of Object.entries(profile.git)) {
                console.log(`    ${bold(k)} = ${v}`);
            }
        }
        if (profile.ssh?.identityFile) {
            console.log(gray("  ssh:"));
            console.log(`    ${bold("identityFile")} = ${profile.ssh.identityFile}`);
        }
    }
});

const setVarCmd = defineCommand({
    meta: { name: "set-var", description: "Set an env var in a profile" },
    args: {
        profile: { type: "positional", description: "Profile name", required: true },
        key: { type: "positional", description: "Variable name", required: true },
        value: { type: "positional", description: "Variable value", required: true }
    },
    async run({ args }) {
        await setVar(args.profile!, args.key!, args.value!);
        console.log(`Set ${bold(args.key!)} in profile ${bold(cyan(args.profile!))}`);
    }
});

const unsetVarCmd = defineCommand({
    meta: { name: "unset-var", description: "Remove an env var from a profile" },
    args: {
        profile: { type: "positional", description: "Profile name", required: true },
        key: { type: "positional", description: "Variable name", required: true }
    },
    async run({ args }) {
        await removeVar(args.profile!, args.key!);
        console.log(`Removed ${bold(args.key!)} from profile ${bold(cyan(args.profile!))}`);
    }
});

const setGitCmd = defineCommand({
    meta: { name: "set-git", description: "Set a git config entry in a profile" },
    args: {
        profile: { type: "positional", description: "Profile name", required: true },
        key: { type: "positional", description: "Git config key (e.g. user.email)", required: true },
        value: { type: "positional", description: "Git config value", required: true }
    },
    async run({ args }) {
        await setGitConfig(args.profile!, args.key!, args.value!);
        console.log(`Set git ${bold(args.key!)} in profile ${bold(cyan(args.profile!))}`);
    }
});

const unsetGitCmd = defineCommand({
    meta: { name: "unset-git", description: "Remove a git config entry from a profile" },
    args: {
        profile: { type: "positional", description: "Profile name", required: true },
        key: { type: "positional", description: "Git config key", required: true }
    },
    async run({ args }) {
        await removeGitConfig(args.profile!, args.key!);
        console.log(`Removed git ${bold(args.key!)} from profile ${bold(cyan(args.profile!))}`);
    }
});

const setSshKeyCmd = defineCommand({
    meta: { name: "set-ssh-key", description: "Set the SSH key for a profile" },
    args: {
        profile: { type: "positional", description: "Profile name", required: true },
        path: { type: "positional", description: "Path to SSH private key", required: true }
    },
    async run({ args }) {
        await setSshKey(args.profile!, args.path!);
        console.log(`Set SSH key for profile ${bold(cyan(args.profile!))}`);
    }
});

const unsetSshKeyCmd = defineCommand({
    meta: { name: "unset-ssh-key", description: "Remove the SSH key from a profile" },
    args: {
        profile: { type: "positional", description: "Profile name", required: true }
    },
    async run({ args }) {
        await removeSshKey(args.profile!);
        console.log(`Removed SSH key from profile ${bold(args.profile!)}`);
    }
});

const applyCmd = defineCommand({
    meta: {
        name: "apply",
        description: "Print export statements to activate a profile (eval with: eval $(tinker profiles apply <name>))"
    },
    args: { name: { type: "positional", description: "Profile name", required: true } },
    async run({ args }) {
        const profile = await readProfile(args.name!);
        let resolver: ((ref: string) => Promise<string>) | undefined;

        if (hasSecretRefs(profile)) {
            const pin = await promptPin("PIN: ");
            const salt = await loadOrCreateSalt();
            const cryptoKey = await deriveKey(pin, salt);
            resolver = async (ref: string) => {
                const value = await getSecret(ref, cryptoKey);
                if (value === null) throw new Error(`Secret "${ref}" not found in vault`);
                return value;
            };
        }

        const lines = await applyProfile(args.name!, resolver);
        for (const line of lines) console.log(line);
    }
});

export const profilesCmd = defineCommand({
    meta: { name: "profiles", description: "Manage environment profiles" },
    subCommands: {
        create: createCmd as CommandDef<ArgsDef>,
        delete: deleteCmd as CommandDef<ArgsDef>,
        list: listCmd as CommandDef<ArgsDef>,
        show: showCmd as CommandDef<ArgsDef>,
        "set-var": setVarCmd as CommandDef<ArgsDef>,
        "unset-var": unsetVarCmd as CommandDef<ArgsDef>,
        "set-git": setGitCmd as CommandDef<ArgsDef>,
        "unset-git": unsetGitCmd as CommandDef<ArgsDef>,
        "set-ssh-key": setSshKeyCmd as CommandDef<ArgsDef>,
        "unset-ssh-key": unsetSshKeyCmd as CommandDef<ArgsDef>,
        apply: applyCmd as CommandDef<ArgsDef>
    }
});
