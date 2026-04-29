import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import { deriveKey, getSecret, listSecretKeys, loadOrCreateSalt, removeSecret, setSecret } from "./secrets.ts";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16));
}

// Override secretsDir for tests by using env var TINKER_SECRETS_DIR.
// Since we can't easily mock it, tests that touch the filesystem use a
// temporary directory by patching the HOME env var.

async function withTmpHome<T>(fn: (tmpDir: string) => Promise<T>): Promise<T> {
    const tmp = await Deno.makeTempDir();
    const origHome = Deno.env.get("HOME");
    Deno.env.set("HOME", tmp);
    try {
        return await fn(tmp);
    } finally {
        if (origHome !== undefined) Deno.env.set("HOME", origHome);
        else Deno.env.delete("HOME");
        await Deno.remove(tmp, { recursive: true });
    }
}

// ── deriveKey ─────────────────────────────────────────────────────────────────

Deno.test("deriveKey produces a usable AES-GCM key", async () => {
    const salt = makeSalt();
    const key = await deriveKey("mypin", salt);
    assertEquals(key.type, "secret");
    assertEquals(key.algorithm.name, "AES-GCM");
});

Deno.test("deriveKey is deterministic — same pin+salt gives equivalent key", async () => {
    const salt = makeSalt();
    const key1 = await deriveKey("samepin", salt);
    const key2 = await deriveKey("samepin", salt);
    // Keys are not extractable so compare via encrypt+decrypt cross-check
    const plaintext = new TextEncoder().encode("test");
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: new Uint8Array(12) }, key1, plaintext);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(12) }, key2, encrypted);
    assertEquals(new Uint8Array(decrypted), plaintext);
});

Deno.test("deriveKey with different PINs produces different keys", async () => {
    const salt = makeSalt();
    const key1 = await deriveKey("pin1", salt);
    const key2 = await deriveKey("pin2", salt);
    const plaintext = new TextEncoder().encode("test");
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: new Uint8Array(12) }, key1, plaintext);
    await assertRejects(
        () => crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(12) }, key2, encrypted),
        DOMException
    );
});

// ── loadOrCreateSalt ──────────────────────────────────────────────────────────

Deno.test("loadOrCreateSalt creates salt on first call", async () => {
    await withTmpHome(async () => {
        const salt = await loadOrCreateSalt();
        assertEquals(salt.byteLength, 16);
    });
});

Deno.test("loadOrCreateSalt returns same salt on subsequent calls", async () => {
    await withTmpHome(async () => {
        const first = await loadOrCreateSalt();
        const second = await loadOrCreateSalt();
        assertEquals(first, second);
    });
});

Deno.test("loadOrCreateSalt generates unique salts across vaults", async () => {
    const [saltA, saltB] = await Promise.all([
        withTmpHome(() => loadOrCreateSalt()),
        withTmpHome(() => loadOrCreateSalt())
    ]);
    assertNotEquals(saltA, saltB);
});

// ── setSecret / getSecret ─────────────────────────────────────────────────────

Deno.test("setSecret + getSecret round-trips a value", async () => {
    await withTmpHome(async () => {
        const salt = makeSalt();
        const key = await deriveKey("pin", salt);
        await setSecret("db_password", "super-secret-123", key);
        const value = await getSecret("db_password", key);
        assertEquals(value, "super-secret-123");
    });
});

Deno.test("getSecret returns null for missing key", async () => {
    await withTmpHome(async () => {
        const key = await deriveKey("pin", makeSalt());
        const value = await getSecret("nonexistent", key);
        assertEquals(value, null);
    });
});

Deno.test("getSecret throws DOMException on wrong PIN", async () => {
    await withTmpHome(async () => {
        const salt = makeSalt();
        const rightKey = await deriveKey("correct-pin", salt);
        const wrongKey = await deriveKey("wrong-pin", salt);
        await setSecret("token", "abc123", rightKey);
        await assertRejects(() => getSecret("token", wrongKey), DOMException);
    });
});

Deno.test("setSecret overwrites an existing key", async () => {
    await withTmpHome(async () => {
        const key = await deriveKey("pin", makeSalt());
        await setSecret("api_key", "old-value", key);
        await setSecret("api_key", "new-value", key);
        assertEquals(await getSecret("api_key", key), "new-value");
    });
});

Deno.test("setSecret stores multiple keys independently", async () => {
    await withTmpHome(async () => {
        const key = await deriveKey("pin", makeSalt());
        await setSecret("a", "value-a", key);
        await setSecret("b", "value-b", key);
        assertEquals(await getSecret("a", key), "value-a");
        assertEquals(await getSecret("b", key), "value-b");
    });
});

Deno.test("setSecret encrypts each key with a different nonce", async () => {
    await withTmpHome(async () => {
        const key = await deriveKey("pin", makeSalt());
        await setSecret("x", "same-value", key);
        await setSecret("y", "same-value", key);
        const raw = await Deno.readTextFile(`${Deno.env.get("HOME")}/.tinker/secrets/vault.json`);
        const vault = JSON.parse(raw) as Record<string, string>;
        assertNotEquals(vault["x"], vault["y"]);
    });
});

// ── listSecretKeys ────────────────────────────────────────────────────────────

Deno.test("listSecretKeys returns empty array when vault is empty", async () => {
    await withTmpHome(async () => {
        assertEquals(await listSecretKeys(), []);
    });
});

Deno.test("listSecretKeys returns sorted key names without PIN", async () => {
    await withTmpHome(async () => {
        const key = await deriveKey("pin", makeSalt());
        await setSecret("zebra", "z", key);
        await setSecret("alpha", "a", key);
        await setSecret("middle", "m", key);
        assertEquals(await listSecretKeys(), ["alpha", "middle", "zebra"]);
    });
});

// ── removeSecret ──────────────────────────────────────────────────────────────

Deno.test("removeSecret removes an existing key", async () => {
    await withTmpHome(async () => {
        const key = await deriveKey("pin", makeSalt());
        await setSecret("temp", "value", key);
        await removeSecret("temp");
        assertEquals(await getSecret("temp", key), null);
        assertEquals(await listSecretKeys(), []);
    });
});

Deno.test("removeSecret is a no-op for missing key", async () => {
    await withTmpHome(async () => {
        await removeSecret("nonexistent");
        assertEquals(await listSecretKeys(), []);
    });
});
