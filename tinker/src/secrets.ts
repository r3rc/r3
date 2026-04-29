import { decryptAesGcm, encryptAesGcm } from "@std/crypto/aes-gcm";
import { crypto } from "@std/crypto/crypto";
import { decodeBase64, encodeBase64 } from "@std/encoding/base64";
import { join } from "@std/path";
import { ensureDir, secretsDir } from "./config.ts";

const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 200_000;

type VaultData = Record<string, string>;

export async function loadOrCreateSalt(): Promise<Uint8Array> {
    const saltPath = join(secretsDir(), "salt");
    try {
        const bytes = await Deno.readFile(saltPath);
        if (bytes.byteLength !== SALT_LENGTH) {
            throw new Error(`Salt file corrupted: expected ${SALT_LENGTH} bytes, got ${bytes.byteLength}`);
        }
        return bytes;
    } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) throw err;
    }
    await ensureDir(secretsDir());
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    await Deno.writeFile(saltPath, salt, { mode: 0o600 });
    return salt;
}

export async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(pin),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: new Uint8Array(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

export async function listSecretKeys(): Promise<string[]> {
    const vault = await _readVault();
    return Object.keys(vault).sort();
}

export async function getSecret(key: string, cryptoKey: CryptoKey): Promise<string | null> {
    const vault = await _readVault();
    const encoded = vault[key];
    if (encoded === undefined) return null;
    const decrypted = await decryptAesGcm(cryptoKey, decodeBase64(encoded));
    return new TextDecoder().decode(decrypted);
}

export async function setSecret(key: string, value: string, cryptoKey: CryptoKey): Promise<void> {
    const vault = await _readVault();
    const encrypted = await encryptAesGcm(cryptoKey, new TextEncoder().encode(value));
    vault[key] = encodeBase64(encrypted);
    await _writeVault(vault);
}

export async function removeSecret(key: string): Promise<void> {
    const vault = await _readVault();
    delete vault[key];
    await _writeVault(vault);
}

// ── internal ──────────────────────────────────────────────────────────────────

async function _readVault(): Promise<VaultData> {
    const path = join(secretsDir(), "vault.json");
    let raw: string;
    try {
        raw = await Deno.readTextFile(path);
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) return {};
        throw err;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const data: VaultData = {};
    for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") data[k] = v;
    }
    return data;
}

async function _writeVault(data: VaultData): Promise<void> {
    const dir = secretsDir();
    await ensureDir(dir);
    const vaultPath = join(dir, "vault.json");
    const tmpPath = join(dir, "vault.json.tmp");
    await Deno.writeTextFile(tmpPath, JSON.stringify(data, null, 4) + "\n");
    await Deno.rename(tmpPath, vaultPath);
}
