import { type ArgsDef, type CommandDef, defineCommand } from "@r3rc/clip";
import { join } from "@std/path";
import { sshDir } from "src/config.ts";
import { bold, cyan, dim, gray } from "src/log.ts";
import { readProfile, removeSshKey, setSshKey } from "src/profiles.ts";
import { genKey, publicKeyContent } from "src/ssh.ts";

const genKeyCmd = defineCommand({
    meta: { name: "gen-key", description: "Generate an ed25519 SSH key for a profile" },
    args: {
        profile: { type: "positional", description: "Profile name", required: true },
        comment: { type: "string", description: "Key comment (default: profile name)", alias: "c" }
    },
    async run({ args }) {
        const keyPath = join(sshDir(), args.profile!, "id_ed25519");
        await genKey(keyPath, args.comment ?? args.profile!);
        await setSshKey(args.profile!, keyPath);
        console.log(`Generated ${bold(keyPath)}`);
        const pub = await publicKeyContent(keyPath);
        if (pub) console.log(gray(pub));
    }
});

const setKeyCmd = defineCommand({
    meta: { name: "set-key", description: "Point a profile to an existing SSH key" },
    args: {
        profile: { type: "positional", description: "Profile name", required: true },
        path: { type: "positional", description: "Path to SSH private key", required: true }
    },
    async run({ args }) {
        await setSshKey(args.profile!, args.path!);
        console.log(`Set SSH key for profile ${bold(cyan(args.profile!))}`);
    }
});

const removeKeyCmd = defineCommand({
    meta: { name: "remove-key", description: "Remove SSH key from a profile", alias: ["rm-key"] },
    args: {
        profile: { type: "positional", description: "Profile name", required: true }
    },
    async run({ args }) {
        await removeSshKey(args.profile!);
        console.log(`Removed SSH key from profile ${bold(args.profile!)}`);
    }
});

const showCmd = defineCommand({
    meta: { name: "show", description: "Show the SSH key configured for a profile" },
    args: {
        profile: { type: "positional", description: "Profile name", required: true }
    },
    async run({ args }) {
        const profile = await readProfile(args.profile!);
        const identityFile = profile.ssh?.identityFile;
        if (!identityFile) {
            dim(`No SSH key configured for profile ${args.profile!}`);
            return;
        }
        console.log(`${bold("Identity:")} ${identityFile}`);
        const pub = await publicKeyContent(identityFile);
        if (pub) {
            console.log(`${bold("Public key:")} ${gray(pub)}`);
        } else {
            dim("  (public key file not found)");
        }
    }
});

export const sshCmd = defineCommand({
    meta: { name: "ssh", description: "Manage SSH keys for profiles" },
    subCommands: {
        "gen-key": genKeyCmd as CommandDef<ArgsDef>,
        "set-key": setKeyCmd as CommandDef<ArgsDef>,
        "remove-key": removeKeyCmd as CommandDef<ArgsDef>,
        show: showCmd as CommandDef<ArgsDef>
    }
});
