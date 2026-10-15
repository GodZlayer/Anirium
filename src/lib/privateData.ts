import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";

export interface PrivateDataContext { table: string; owner: string; record: string; field: string }
type Envelope = { _anirium_private: 1; alg: "A256GCM"; kid: string; iv: string; ct: string; tag: string };
const maximumBytes = 128 * 1024;
const keyIdPattern = /^[A-Za-z0-9_-]{1,64}$/;

function decodeBase64(value: unknown, length?: number): Buffer {
  if (typeof value !== "string" || value.length > maximumBytes * 2) throw new Error("Invalid encrypted data");
  const result = Buffer.from(value, "base64");
  if (result.toString("base64") !== value || (length !== undefined && result.length !== length)) { result.fill(0); throw new Error("Invalid encrypted data"); }
  return result;
}

export function readExternalSecretKeyring(path: string | undefined) {
  // Only a path is configured; key bytes never belong in env, DB, manifests or
  // browser bundles. Deployment mounts this file read-only outside the project.
  if (!path || !isAbsolute(path)) throw new Error("Private data keyring unavailable");
  const resolved = realpathSync(path);
  const inside = relative(realpathSync(process.cwd()), resolved);
  if (!(inside === ".." || inside.startsWith(".." + sep) || isAbsolute(inside))) throw new Error("Private data keyring must be outside project");
  const info = statSync(resolved);
  if (!info.isFile() || info.size > 16384 || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw new Error("Private data keyring permissions invalid");
  let config;
  try { config = JSON.parse(readFileSync(resolved, "utf8")); } catch { throw new Error("Private data keyring invalid"); }
  if (!config || typeof config.activeKeyId !== "string" || !keyIdPattern.test(config.activeKeyId) || !Array.isArray(config.keys)) throw new Error("Private data keyring invalid");
  const entries = config.keys;
  if (entries.length === 0 || entries.length > 16) throw new Error("Private data keyring invalid");
  const keys = new Map<string, Buffer>();
  try {
    for (const entry of entries) {
      if (!entry || typeof entry.id !== "string" || !keyIdPattern.test(entry.id) || keys.has(entry.id)) throw new Error("Private data keyring invalid");
      keys.set(entry.id, decodeBase64(entry.key, 32));
    }
    if (!keys.has(config.activeKeyId)) throw new Error("Private data keyring invalid");
  } catch (error) { for (const key of keys.values()) key.fill(0); throw error; }
  return { activeKeyId: config.activeKeyId as string, keys };
}

function keyring() { return readExternalSecretKeyring(process.env.ANIRIUM_DATA_KEYRING_FILE); }

function aad(context: PrivateDataContext, kid: string) {
  const parts = [context.table, context.owner, context.record, context.field];
  if (parts.some(value => typeof value !== "string" || !value || value.length > 256)) throw new Error("Invalid private data context");
  return Buffer.from(JSON.stringify(["anirium.private", 1, "A256GCM", kid, ...parts]));
}

export function isPrivateEnvelope(value: unknown): boolean {
  return !!value && typeof value === "object" && "_anirium_private" in value;
}

export function encryptPrivateJson(value: unknown, context: PrivateDataContext): Envelope {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized) > maximumBytes) throw new Error("Private data exceeds limit");
  const { activeKeyId: kid, keys } = keyring();
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keys.get(kid)!, iv, { authTagLength: 16 });
    cipher.setAAD(aad(context, kid));
    const ct = Buffer.concat([cipher.update(serialized, "utf8"), cipher.final()]);
    return { _anirium_private: 1, alg: "A256GCM", kid, iv: iv.toString("base64"), ct: ct.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
  } finally { for (const key of keys.values()) key.fill(0); }
}

export function decryptPrivateJson(value: unknown, context: PrivateDataContext): any {
  const envelope = value as Envelope;
  if (!envelope || envelope._anirium_private !== 1 || envelope.alg !== "A256GCM" || !keyIdPattern.test(envelope.kid) || Object.keys(envelope).sort().join(",") !== "_anirium_private,alg,ct,iv,kid,tag") throw new Error("Invalid encrypted data");
  const { keys } = keyring();
  try {
    const key = keys.get(envelope.kid);
    if (!key) throw new Error("Encrypted data key unavailable");
    const iv = decodeBase64(envelope.iv, 12), tag = decodeBase64(envelope.tag, 16), ct = decodeBase64(envelope.ct);
    if (ct.length > maximumBytes) throw new Error("Invalid encrypted data");
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipher.setAAD(aad(context, envelope.kid));
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8"));
  } catch { throw new Error("Private data authentication failed"); }
  finally { for (const key of keys.values()) key.fill(0); }
}

export function readStoredPrivateJson(value: any, context: PrivateDataContext): any {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!isPrivateEnvelope(parsed)) throw new Error("Private data requires encrypted migration");
  return decryptPrivateJson(parsed, context);
}

export function addonPrivateContext(owner: string, addonId: string): PrivateDataContext {
  return { table: "user_addons", owner, record: addonId, field: "config_json" };
}

export function profileSettingsPrivateContext(owner: string): PrivateDataContext {
  return { table: "users", owner, record: owner, field: "settings_json" };
}
