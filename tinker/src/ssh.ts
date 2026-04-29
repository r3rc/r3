import { join } from "@std/path";
import { ensureDir, sshDir } from "./config.ts";
import { warn } from "./log.ts";

// ── types ─────────────────────────────────────────────────────────────────────

type AgentState = { socket: string; pid: number };

// ── paths ─────────────────────────────────────────────────────────────────────

function _profileSshDir(profileName: string): string {
    return join(sshDir(), profileName);
}

function _agentStatePath(profileName: string): string {
    return join(_profileSshDir(profileName), "agent.json");
}

// ── agent state persistence ───────────────────────────────────────────────────

async function _readAgentState(profileName: string): Promise<AgentState | null> {
    try {
        const raw = await Deno.readTextFile(_agentStatePath(profileName));
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed["socket"] === "string" && typeof parsed["pid"] === "number") {
            return { socket: parsed["socket"], pid: parsed["pid"] };
        }
        return null;
    } catch {
        return null;
    }
}

async function _writeAgentState(profileName: string, state: AgentState): Promise<void> {
    await ensureDir(_profileSshDir(profileName));
    await Deno.writeTextFile(_agentStatePath(profileName), JSON.stringify(state, null, 4) + "\n");
}

async function _isAgentAlive(pid: number): Promise<boolean> {
    const { success } = await new Deno.Command("kill", {
        args: ["-0", String(pid)],
        stdout: "null",
        stderr: "null"
    }).output();
    return success;
}

// ── parsing ───────────────────────────────────────────────────────────────────

// ssh-agent -s emits:
// SSH_AUTH_SOCK=/tmp/ssh-XXXX/agent.PID; export SSH_AUTH_SOCK;
// SSH_AGENT_PID=12345; export SSH_AGENT_PID;
export function parseAgentOutput(output: string): AgentState | null {
    const socketMatch = output.match(/SSH_AUTH_SOCK=([^;]+);/);
    const pidMatch = output.match(/SSH_AGENT_PID=(\d+);/);
    if (!socketMatch?.[1] || !pidMatch?.[1]) return null;
    const pid = parseInt(pidMatch[1], 10);
    if (isNaN(pid)) return null;
    return { socket: socketMatch[1], pid };
}

// ── public API ────────────────────────────────────────────────────────────────

export async function genKey(keyPath: string, comment: string): Promise<void> {
    try {
        await Deno.stat(keyPath);
        throw new Error(`Key already exists: ${keyPath}`);
    } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) throw err;
    }
    const { success, stderr } = await new Deno.Command("ssh-keygen", {
        args: ["-t", "ed25519", "-f", keyPath, "-C", comment, "-N", ""],
        stdout: "null",
        stderr: "piped"
    }).output();
    if (!success) {
        throw new Error(`ssh-keygen failed: ${new TextDecoder().decode(stderr).trim()}`);
    }
}

export async function activateAgent(
    profileName: string,
    identityFile: string
): Promise<{ SSH_AUTH_SOCK: string; SSH_AGENT_PID: string }> {
    let state: AgentState;

    const existing = await _readAgentState(profileName);
    if (existing && (await _isAgentAlive(existing.pid))) {
        state = existing;
    } else {
        const { success, stdout, stderr } = await new Deno.Command("ssh-agent", {
            args: ["-s"],
            stdout: "piped",
            stderr: "piped"
        }).output();
        if (!success) {
            throw new Error(`ssh-agent failed: ${new TextDecoder().decode(stderr).trim()}`);
        }
        const parsed = parseAgentOutput(new TextDecoder().decode(stdout));
        if (!parsed) throw new Error("Failed to parse ssh-agent output");
        state = parsed;
        await _writeAgentState(profileName, state);
    }

    try {
        await Deno.stat(identityFile);
    } catch {
        warn(`SSH identity file not found: ${identityFile}`);
        return { SSH_AUTH_SOCK: state.socket, SSH_AGENT_PID: String(state.pid) };
    }

    // Inherit current env so ssh-add can locate system config, then override SSH_AUTH_SOCK
    const { success: addOk, stderr: addErr } = await new Deno.Command("ssh-add", {
        args: [identityFile],
        env: { ...Deno.env.toObject(), SSH_AUTH_SOCK: state.socket },
        stdout: "null",
        stderr: "piped"
    }).output();
    if (!addOk) {
        warn(`ssh-add failed: ${new TextDecoder().decode(addErr).trim()}`);
    }

    return { SSH_AUTH_SOCK: state.socket, SSH_AGENT_PID: String(state.pid) };
}

export async function publicKeyContent(identityFile: string): Promise<string | null> {
    try {
        return (await Deno.readTextFile(identityFile + ".pub")).trim();
    } catch {
        return null;
    }
}
