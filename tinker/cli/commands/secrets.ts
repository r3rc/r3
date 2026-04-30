import { type ArgsDef, type CommandDef, defineCommand } from "@r3rc/clip";
import { bold, cyan, dim, fatal, promptPin } from "src/log.ts";
import { deriveKey, getSecret, listSecretKeys, loadOrCreateSalt, removeSecret, setSecret } from "src/secrets.ts";

const setCmd = defineCommand({
    meta: { name: "set", description: "Encrypt and store a secret" },
    args: {
        key: { type: "positional", description: "Secret name", required: true },
        value: { type: "positional", description: "Secret value", required: true }
    },
    async run({ args }) {
        const pin = await promptPin("PIN: ");
        const salt = await loadOrCreateSalt();
        const cryptoKey = await deriveKey(pin, salt);
        await setSecret(args.key!, args.value!, cryptoKey);
        console.log(`Stored ${bold(cyan(args.key!))}`);
    }
});

const getCmd = defineCommand({
    meta: { name: "get", description: "Decrypt and print a secret" },
    args: {
        key: { type: "positional", description: "Secret name", required: true }
    },
    async run({ args }) {
        const pin = await promptPin("PIN: ");
        const salt = await loadOrCreateSalt();
        const cryptoKey = await deriveKey(pin, salt);
        let value: string | null;
        try {
            value = await getSecret(args.key!, cryptoKey);
        } catch (err) {
            if (err instanceof DOMException) fatal("Wrong PIN or corrupted vault");
            throw err;
        }
        if (value === null) fatal(`Secret "${args.key!}" not found`);
        console.log(value);
    }
});

const listCmd = defineCommand({
    meta: { name: "list", description: "List all secret names (no PIN required)" },
    async run() {
        const keys = await listSecretKeys();
        if (keys.length === 0) {
            dim("No secrets stored.");
            return;
        }
        for (const k of keys) console.log(bold(k));
    }
});

const removeCmd = defineCommand({
    meta: { name: "remove", description: "Delete a secret (no PIN required)", alias: ["rm"] },
    args: {
        key: { type: "positional", description: "Secret name to remove", required: true }
    },
    async run({ args }) {
        await removeSecret(args.key!);
        console.log(`Removed ${bold(cyan(args.key!))}`);
    }
});

export const secretsCmd = defineCommand({
    meta: { name: "secrets", description: "Manage encrypted secrets" },
    subCommands: {
        set: setCmd as CommandDef<ArgsDef>,
        get: getCmd as CommandDef<ArgsDef>,
        list: listCmd as CommandDef<ArgsDef>,
        remove: removeCmd as CommandDef<ArgsDef>
    }
});
