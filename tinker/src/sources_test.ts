import { assertEquals } from "@std/assert";
import { nameFromUrl } from "./sources.ts";

Deno.test("nameFromUrl strips .git suffix", () => {
    assertEquals(nameFromUrl("https://github.com/denoland/deno_std.git"), "deno_std");
});

Deno.test("nameFromUrl without .git suffix", () => {
    assertEquals(nameFromUrl("https://github.com/unjs/citty"), "citty");
});

Deno.test("nameFromUrl SSH format", () => {
    assertEquals(nameFromUrl("git@github.com:denoland/deno_std.git"), "deno_std");
});

Deno.test("nameFromUrl single segment", () => {
    assertEquals(nameFromUrl("https://example.com/repo"), "repo");
});
