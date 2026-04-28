import { assertEquals, assertThrows } from "@std/assert";
import { parseArgs } from "./args.ts";

Deno.test("parseArgs: boolean flag", () => {
    const result = parseArgs(["--verbose"], { verbose: { type: "boolean" } });
    assertEquals(result.verbose, true);
    assertEquals(result._, []);
});

Deno.test("parseArgs: boolean default false", () => {
    const result = parseArgs([], { verbose: { type: "boolean", default: false } });
    assertEquals(result.verbose, false);
});

Deno.test("parseArgs: --no-flag negates boolean", () => {
    const result = parseArgs(["--no-verbose"], { verbose: { type: "boolean", default: true } });
    assertEquals(result.verbose, false);
});

Deno.test("parseArgs: string flag", () => {
    const result = parseArgs(["--name", "alice"], { name: { type: "string" } });
    assertEquals(result.name, "alice");
});

Deno.test("parseArgs: string flag with =", () => {
    const result = parseArgs(["--name=alice"], { name: { type: "string" } });
    assertEquals(result.name, "alice");
});

Deno.test("parseArgs: positional argument", () => {
    const result = parseArgs(["hello"], { target: { type: "positional" } });
    assertEquals(result.target, "hello");
});

Deno.test("parseArgs: missing required positional throws", () => {
    assertThrows(
        () => parseArgs([], { target: { type: "positional" } }),
        Error,
        "Missing required positional argument: TARGET"
    );
});

Deno.test("parseArgs: optional positional with default", () => {
    const result = parseArgs([], { target: { type: "positional", required: false, default: "world" } });
    assertEquals(result.target, "world");
});

Deno.test("parseArgs: enum valid value", () => {
    const result = parseArgs(["--format", "json"], { format: { type: "enum", options: ["json", "text"] } });
    assertEquals(result.format, "json");
});

Deno.test("parseArgs: enum invalid value throws", () => {
    assertThrows(
        () => parseArgs(["--format", "xml"], { format: { type: "enum", options: ["json", "text"] } }),
        Error,
        "Invalid value for argument"
    );
});

Deno.test("parseArgs: missing required string throws", () => {
    assertThrows(
        () => parseArgs([], { name: { type: "string", required: true } }),
        Error,
        "Missing required argument"
    );
});

Deno.test("parseArgs: alias", () => {
    const result = parseArgs(["-v"], { verbose: { type: "boolean", alias: "v" } });
    assertEquals(result.verbose, true);
});

Deno.test("parseArgs: kebab-case alias via proxy", () => {
    const result = parseArgs(["--user-name", "alice"], { userName: { type: "string" } });
    assertEquals(result["user-name"], "alice");
    assertEquals(result.userName, "alice");
});

Deno.test("parseArgs: positionals in _", () => {
    const result = parseArgs(["a", "b"], {});
    assertEquals(result._, ["a", "b"]);
});
