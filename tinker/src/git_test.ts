import { assertEquals } from "@std/assert";
import { diagnoseError } from "./git.ts";

Deno.test("diagnoseError auth failure", () => {
    const hint = diagnoseError("fatal: Authentication failed for 'https://github.com/private/repo'");
    assertEquals(hint, "SSH key not configured or credentials expired");
});

Deno.test("diagnoseError repo not found", () => {
    const hint = diagnoseError("ERROR: Repository not found.");
    assertEquals(hint, "Repository not found — verify the URL");
});

Deno.test("diagnoseError network error", () => {
    const hint = diagnoseError("fatal: unable to access 'https://github.com/': Could not resolve host: github.com");
    assertEquals(hint, "Network error — check your connection");
});

Deno.test("diagnoseError fallback", () => {
    const hint = diagnoseError("some unknown error message");
    assertEquals(hint, "Check the URL and your git configuration");
});

Deno.test("diagnoseError is case-insensitive", () => {
    const hint = diagnoseError("FATAL: AUTHENTICATION FAILED");
    assertEquals(hint, "SSH key not configured or credentials expired");
});
