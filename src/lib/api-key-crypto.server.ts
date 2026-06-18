// MANUAL SETUP REQUIRED: Add API_KEY_ENCRYPTION_SECRET
// to your environment variables. This must be a 32-character
// random string. Never change it after keys are encrypted
// or all existing keys become unreadable.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function getKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error("API_KEY_ENCRYPTION_SECRET is not set");
  // Derive a stable 32-byte key from the secret via SHA-256 so any
  // secret length is accepted while always producing an AES-256 key.
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a raw API key with AES-256-GCM.
 * Returns base64(iv | authTag | ciphertext).
 * Server-only — never call from the browser.
 */
export function encryptApiKey(rawKey: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(rawKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/**
 * Decrypt a stored encrypted API key. Server-only.
 */
export function decryptApiKey(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}