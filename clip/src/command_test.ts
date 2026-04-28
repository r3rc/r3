import { assertEquals, assertRejects } from "@std/assert";
import { defineCommand, runCommand } from "./command.ts";

Deno.test("runCommand: basic run", async () => {
    let called = false;
    const cmd = defineCommand({
        run: () => {
            called = true;
        }
    });
    await runCommand(cmd, { rawArgs: [] });
    assertEquals(called, true);
});

Deno.test("runCommand: run receives parsed args", async () => {
    let received: string | undefined;
    const cmd = defineCommand({
        args: { name: { type: "string" } },
        run: (ctx) => {
            received = ctx.args.name as string;
        }
    });
    await runCommand(cmd, { rawArgs: ["--name", "alice"] });
    assertEquals(received, "alice");
});

Deno.test("runCommand: setup runs before run", async () => {
    const order: string[] = [];
    const cmd = defineCommand({
        setup: () => {
            order.push("setup");
        },
        run: () => {
            order.push("run");
        }
    });
    await runCommand(cmd, { rawArgs: [] });
    assertEquals(order, ["setup", "run"]);
});

Deno.test("runCommand: cleanup always runs after error", async () => {
    let cleanupCalled = false;
    const cmd = defineCommand({
        run: () => {
            throw new Error("boom");
        },
        cleanup: () => {
            cleanupCalled = true;
        }
    });
    await assertRejects(() => runCommand(cmd, { rawArgs: [] }), Error, "boom");
    assertEquals(cleanupCalled, true);
});

Deno.test("runCommand: subcommand routing", async () => {
    let subRan = false;
    const sub = defineCommand({
        run: () => {
            subRan = true;
        }
    });
    const cmd = defineCommand({ subCommands: { sub } });
    await runCommand(cmd, { rawArgs: ["sub"] });
    assertEquals(subRan, true);
});

Deno.test("runCommand: unknown subcommand throws", async () => {
    const sub = defineCommand({ run: () => {} });
    const cmd = defineCommand({ subCommands: { sub } });
    await assertRejects(() => runCommand(cmd, { rawArgs: ["unknown"] }), Error, "Unknown command");
});

Deno.test("runCommand: default subcommand", async () => {
    let subRan = false;
    const sub = defineCommand({
        run: () => {
            subRan = true;
        }
    });
    const cmd = defineCommand({ subCommands: { sub }, default: "sub" });
    await runCommand(cmd, { rawArgs: [] });
    assertEquals(subRan, true);
});

Deno.test("runCommand: cleanup runs after run", async () => {
    const order: string[] = [];
    const cmd = defineCommand({
        setup: () => {
            order.push("setup");
        },
        run: () => {
            order.push("run");
        },
        cleanup: () => {
            order.push("cleanup");
        }
    });
    await runCommand(cmd, { rawArgs: [] });
    assertEquals(order, ["setup", "run", "cleanup"]);
});
