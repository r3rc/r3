import { defineCommand, runMain } from "@r3rc/clip";
import { profilesCmd } from "./commands/profiles.ts";
import { secretsCmd } from "./commands/secrets.ts";
import { sourcesCmd } from "./commands/sources.ts";
import { sshCmd } from "./commands/ssh.ts";

const rootCmd = defineCommand({
    meta: { name: "tinker", version: "0.1.0", description: "Workspace toolkit" },
    subCommands: { sources: sourcesCmd, secrets: secretsCmd, profiles: profilesCmd, ssh: sshCmd }
});

await runMain(rootCmd);
