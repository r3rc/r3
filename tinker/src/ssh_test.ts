import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { activateAgent, genKey, parseAgentOutput, publicKeyContent } from "./ssh.ts";

async function withTmpHome<T>(fn: () => Promise<T>): Promise<T> {
    const tmp = await Deno.makeTempDir();
    const orig = Deno.env.get("HOME");
    Deno.env.set("HOME", tmp);
    try {
        return await fn();
    } finally {
        if (orig !== undefined) Deno.env.set("HOME", orig);
        else Deno.env.delete("HOME");
        await Deno.remove(tmp, { recursive: true });
    }
}

// ── parseAgentOutput ──────────────────────────────────────────────────────────

Deno.test("parseAgentOutput extracts socket and pid", () => {
    const output = [
        "SSH_AUTH_SOCK=/tmp/ssh-abc/agent.123; export SSH_AUTH_SOCK;",
        "SSH_AGENT_PID=123; export SSH_AGENT_PID;",
        "echo Agent pid 123;"
    ].join("\n");
    assertEquals(parseAgentOutput(output), { socket: "/tmp/ssh-abc/agent.123", pid: 123 });
});

Deno.test("parseAgentOutput returns null on malformed output", () => {
    assertEquals(parseAgentOutput("not valid output"), null);
    assertEquals(parseAgentOutput(""), null);
    // Missing PID line
    assertEquals(parseAgentOutput("SSH_AUTH_SOCK=/tmp/x; export SSH_AUTH_SOCK;"), null);
    // Missing socket line
    assertEquals(parseAgentOutput("SSH_AGENT_PID=99; export SSH_AGENT_PID;"), null);
});

// ── genKey ────────────────────────────────────────────────────────────────────

Deno.test("genKey generates ed25519 key pair", async () => {
    const tmp = await Deno.makeTempDir();
    try {
        const keyPath = join(tmp, "id_ed25519");
        await genKey(keyPath, "test@example.com");
        assertEquals((await Deno.stat(keyPath)).isFile, true);
        assertEquals((await Deno.stat(keyPath + ".pub")).isFile, true);
    } finally {
        await Deno.remove(tmp, { recursive: true });
    }
});

Deno.test("genKey public key starts with ssh-ed25519", async () => {
    const tmp = await Deno.makeTempDir();
    try {
        const keyPath = join(tmp, "id_ed25519");
        await genKey(keyPath, "test");
        const pub = await Deno.readTextFile(keyPath + ".pub");
        assertEquals(pub.trim().startsWith("ssh-ed25519"), true);
    } finally {
        await Deno.remove(tmp, { recursive: true });
    }
});

Deno.test("genKey throws if key already exists", async () => {
    const tmp = await Deno.makeTempDir();
    try {
        const keyPath = join(tmp, "id_ed25519");
        await genKey(keyPath, "test");
        await assertRejects(() => genKey(keyPath, "test"), Error, "Key already exists");
    } finally {
        await Deno.remove(tmp, { recursive: true });
    }
});

// ── publicKeyContent ──────────────────────────────────────────────────────────

Deno.test("publicKeyContent reads .pub file", async () => {
    const tmp = await Deno.makeTempDir();
    try {
        const keyPath = join(tmp, "id_ed25519");
        await genKey(keyPath, "test");
        const pub = await publicKeyContent(keyPath);
        assertEquals(pub !== null && pub.startsWith("ssh-ed25519"), true);
    } finally {
        await Deno.remove(tmp, { recursive: true });
    }
});

Deno.test("publicKeyContent returns null for missing key", async () => {
    assertEquals(await publicKeyContent("/nonexistent/path"), null);
});

// ── activateAgent ─────────────────────────────────────────────────────────────

Deno.test("activateAgent starts agent and exports socket and pid", async () => {
    await withTmpHome(async () => {
        const tmp = await Deno.makeTempDir();
        try {
            const keyPath = join(tmp, "id_ed25519");
            await genKey(keyPath, "test");
            const vars = await activateAgent("test-profile", keyPath);
            assertEquals(vars.SSH_AUTH_SOCK.length > 0, true);
            assertEquals(isNaN(parseInt(vars.SSH_AGENT_PID, 10)), false);
            await new Deno.Command("kill", { args: [vars.SSH_AGENT_PID], stdout: "null", stderr: "null" }).output();
        } finally {
            await Deno.remove(tmp, { recursive: true });
        }
    });
});

Deno.test("activateAgent reuses a running agent", async () => {
    await withTmpHome(async () => {
        const tmp = await Deno.makeTempDir();
        try {
            const keyPath = join(tmp, "id_ed25519");
            await genKey(keyPath, "test");
            const first = await activateAgent("reuse-profile", keyPath);
            const second = await activateAgent("reuse-profile", keyPath);
            assertEquals(first.SSH_AGENT_PID, second.SSH_AGENT_PID);
            assertEquals(first.SSH_AUTH_SOCK, second.SSH_AUTH_SOCK);
            await new Deno.Command("kill", { args: [first.SSH_AGENT_PID], stdout: "null", stderr: "null" }).output();
        } finally {
            await Deno.remove(tmp, { recursive: true });
        }
    });
});

Deno.test("activateAgent warns and continues when identity file missing", async () => {
    await withTmpHome(async () => {
        const vars = await activateAgent("no-key-profile", "/nonexistent/key");
        assertEquals(vars.SSH_AUTH_SOCK.length > 0, true);
        await new Deno.Command("kill", { args: [vars.SSH_AGENT_PID], stdout: "null", stderr: "null" }).output();
    });
});
