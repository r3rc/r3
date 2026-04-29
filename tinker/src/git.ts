const decoder = new TextDecoder();

export interface GitResult {
    success: boolean;
    stdout: string;
    stderr: string;
}

export function cloneShallow(url: string, dest: string): Promise<GitResult> {
    return _run(["git", "clone", "--depth", "1", "--no-tags", "--single-branch", url, dest], undefined);
}

export async function headSha(dir: string): Promise<string> {
    const result = await _run(["git", "rev-parse", "--short", "HEAD"], dir);
    if (!result.success) throw new Error(`git rev-parse failed: ${result.stderr}`);
    return result.stdout.trim();
}

export function diagnoseError(stderr: string): string {
    const s = stderr.toLowerCase();
    if (s.includes("authentication failed") || s.includes("could not read username")) {
        return "SSH key not configured or credentials expired";
    }
    if (s.includes("repository not found") || s.includes("does not exist")) {
        return "Repository not found — verify the URL";
    }
    if (s.includes("could not resolve host") || s.includes("unable to access")) {
        return "Network error — check your connection";
    }
    return "Check the URL and your git configuration";
}

async function _run(args: string[], cwd: string | undefined): Promise<GitResult> {
    const cmd = new Deno.Command(args[0]!, {
        args: args.slice(1),
        cwd,
        stdout: "piped",
        stderr: "piped"
    });
    let output: Deno.CommandOutput;
    try {
        output = await cmd.output();
    } catch {
        throw new Error("git not found — ensure git is installed and on PATH");
    }
    return {
        success: output.success,
        stdout: decoder.decode(output.stdout),
        stderr: decoder.decode(output.stderr)
    };
}
