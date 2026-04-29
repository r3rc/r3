import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
    applyProfile,
    createProfile,
    deleteProfile,
    hasSecretRefs,
    listProfiles,
    readProfile,
    removeGitConfig,
    removeSshKey,
    removeVar,
    setGitConfig,
    setSshKey,
    setVar,
    validateProfileName
} from "./profiles.ts";

// ── helpers ───────────────────────────────────────────────────────────────────

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

// ── validateProfileName ───────────────────────────────────────────────────────

Deno.test("validateProfileName accepts valid names", () => {
    for (const name of ["work", "my-profile", "Profile1", "a_b_c", "x"]) {
        validateProfileName(name);
    }
});

Deno.test("validateProfileName rejects empty string", () => {
    assertThrows(() => validateProfileName(""), Error, "Invalid profile name");
});

Deno.test("validateProfileName rejects names starting with digit", () => {
    assertThrows(() => validateProfileName("1work"), Error, "Invalid profile name");
});

Deno.test("validateProfileName rejects names with spaces", () => {
    assertThrows(() => validateProfileName("my profile"), Error, "Invalid profile name");
});

Deno.test("validateProfileName rejects names with colons", () => {
    assertThrows(() => validateProfileName("my:profile"), Error, "Invalid profile name");
});

// ── createProfile / readProfile ───────────────────────────────────────────────

Deno.test("createProfile creates an empty profile", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        const profile = await readProfile("work");
        assertEquals(profile.name, "work");
        assertEquals(profile.env, {});
        assertEquals(profile.git, {});
    });
});

Deno.test("createProfile throws on duplicate name", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await assertRejects(() => createProfile("work"), Error, "already exists");
    });
});

Deno.test("readProfile throws on missing profile", async () => {
    await withTmpHome(async () => {
        await assertRejects(() => readProfile("nonexistent"), Error, "not found");
    });
});

// ── deleteProfile ─────────────────────────────────────────────────────────────

Deno.test("deleteProfile removes the profile file", async () => {
    await withTmpHome(async () => {
        await createProfile("temp");
        await deleteProfile("temp");
        await assertRejects(() => readProfile("temp"), Error, "not found");
    });
});

Deno.test("deleteProfile throws on missing profile", async () => {
    await withTmpHome(async () => {
        await assertRejects(() => deleteProfile("ghost"), Error, "not found");
    });
});

// ── listProfiles ──────────────────────────────────────────────────────────────

Deno.test("listProfiles returns empty array when no profiles exist", async () => {
    await withTmpHome(async () => {
        assertEquals(await listProfiles(), []);
    });
});

Deno.test("listProfiles returns sorted names", async () => {
    await withTmpHome(async () => {
        await createProfile("zebra");
        await createProfile("alpha");
        await createProfile("middle");
        assertEquals(await listProfiles(), ["alpha", "middle", "zebra"]);
    });
});

Deno.test("listProfiles excludes deleted profiles", async () => {
    await withTmpHome(async () => {
        await createProfile("keep");
        await createProfile("drop");
        await deleteProfile("drop");
        assertEquals(await listProfiles(), ["keep"]);
    });
});

// ── setVar / removeVar ────────────────────────────────────────────────────────

Deno.test("setVar adds an env var to a profile", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setVar("work", "AWS_PROFILE", "prod");
        const profile = await readProfile("work");
        assertEquals(profile.env["AWS_PROFILE"], "prod");
    });
});

Deno.test("setVar overwrites an existing var", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setVar("work", "FOO", "old");
        await setVar("work", "FOO", "new");
        const profile = await readProfile("work");
        assertEquals(profile.env["FOO"], "new");
    });
});

Deno.test("removeVar deletes an env var", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setVar("work", "REMOVE_ME", "value");
        await removeVar("work", "REMOVE_ME");
        const profile = await readProfile("work");
        assertEquals(profile.env["REMOVE_ME"], undefined);
    });
});

Deno.test("removeVar is a no-op for missing var", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await removeVar("work", "NONEXISTENT");
        const profile = await readProfile("work");
        assertEquals(Object.keys(profile.env).length, 0);
    });
});

// ── setGitConfig / removeGitConfig ────────────────────────────────────────────

Deno.test("setGitConfig adds a git config entry", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setGitConfig("work", "user.email", "me@work.com");
        const profile = await readProfile("work");
        assertEquals(profile.git["user.email"], "me@work.com");
    });
});

Deno.test("removeGitConfig deletes a git config entry", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setGitConfig("work", "user.email", "me@work.com");
        await removeGitConfig("work", "user.email");
        const profile = await readProfile("work");
        assertEquals(profile.git["user.email"], undefined);
    });
});

// ── applyProfile ──────────────────────────────────────────────────────────────

Deno.test("applyProfile generates export lines for env vars", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setVar("work", "FOO", "bar");
        await setVar("work", "GREETING", "hello world");
        const lines = await applyProfile("work");
        // TINKER_PROFILE is always included
        const hasProfile = lines.some((l) => l.includes("TINKER_PROFILE") && l.includes("work"));
        const hasFoo = lines.some((l) => l.includes("FOO") && l.includes("bar"));
        const hasGreeting = lines.some((l) => l.includes("GREETING") && l.includes("hello world"));
        assertEquals(hasProfile, true);
        assertEquals(hasFoo, true);
        assertEquals(hasGreeting, true);
    });
});

Deno.test("applyProfile all lines start with 'export '", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setVar("work", "A", "1");
        await setVar("work", "B", "two");
        const lines = await applyProfile("work");
        for (const line of lines) {
            assertEquals(line.startsWith("export "), true);
        }
    });
});

Deno.test("applyProfile skips secret refs when no resolver provided", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setVar("work", "TOKEN", "$secret:my_token");
        await setVar("work", "PLAIN", "visible");
        const lines = await applyProfile("work");
        const hasToken = lines.some((l) => l.includes("TOKEN"));
        const hasPlain = lines.some((l) => l.includes("PLAIN=visible"));
        assertEquals(hasToken, false);
        assertEquals(hasPlain, true);
    });
});

Deno.test("applyProfile resolves secret refs via callback", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setVar("work", "TOKEN", "$secret:my_token");
        const lines = await applyProfile("work", (ref) => {
            assertEquals(ref, "my_token");
            return Promise.resolve("resolved-value");
        });
        const hasToken = lines.some((l) => l.includes("TOKEN") && l.includes("resolved-value"));
        assertEquals(hasToken, true);
    });
});

// ── hasSecretRefs ─────────────────────────────────────────────────────────────

Deno.test("hasSecretRefs returns true when a var uses $secret:", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setVar("work", "TOKEN", "$secret:tok");
        const profile = await readProfile("work");
        assertEquals(hasSecretRefs(profile), true);
    });
});

Deno.test("hasSecretRefs returns false when no secret refs", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setVar("work", "FOO", "bar");
        const profile = await readProfile("work");
        assertEquals(hasSecretRefs(profile), false);
    });
});

// ── setSshKey / removeSshKey ──────────────────────────────────────────────────

Deno.test("setSshKey stores identity file in profile", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setSshKey("work", "/home/user/.ssh/work_ed25519");
        const profile = await readProfile("work");
        assertEquals(profile.ssh?.identityFile, "/home/user/.ssh/work_ed25519");
    });
});

Deno.test("setSshKey overwrites existing key path", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setSshKey("work", "/old/path");
        await setSshKey("work", "/new/path");
        const profile = await readProfile("work");
        assertEquals(profile.ssh?.identityFile, "/new/path");
    });
});

Deno.test("removeSshKey clears ssh config", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await setSshKey("work", "/home/user/.ssh/work_ed25519");
        await removeSshKey("work");
        const profile = await readProfile("work");
        assertEquals(profile.ssh, undefined);
    });
});

Deno.test("removeSshKey is a no-op when no key configured", async () => {
    await withTmpHome(async () => {
        await createProfile("work");
        await removeSshKey("work");
        const profile = await readProfile("work");
        assertEquals(profile.ssh, undefined);
    });
});
