import { createHmac } from "node:crypto";
import { readExternalSecretKeyring, encryptPrivateJson, decryptPrivateJson, isPrivateEnvelope, type PrivateDataContext } from "./privateData";

// The caller must obtain the subject from a verified Google identity token.
// Candidates are lookup values; they do not authorize or create an account.
function checkSubject(subject: string) {
  if (typeof subject !== "string" || !subject || subject.length > 256 || /[\u0000-\u0020\u007f]/.test(subject)) {
    throw new Error("Invalid identity subject");
  }
}

function subjectContext(id: string): PrivateDataContext {
  if (typeof id !== "string" || !id || id.length > 256) throw new Error("Invalid internal identity");
  return { table: "users", owner: id, record: id, field: "google_subject_private" };
}

export function encodeGoogleSubject(id: string, subject: string) {
  checkSubject(subject);
  return encryptPrivateJson({ subject }, subjectContext(id));
}

export function authenticateGoogleSubject(row: { id: string; google_subject_private?: unknown }, subject: string) {
  checkSubject(subject);
  if (!isPrivateEnvelope(row.google_subject_private)) throw new Error("Invalid encrypted identity");
  const value = decryptPrivateJson(row.google_subject_private, subjectContext(row.id));
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || value.subject !== subject) {
    throw new Error("Identity binding mismatch");
  }
}

export function googleIdentityLookups(subject: string) {
  checkSubject(subject);
  const identity = readExternalSecretKeyring(process.env.ANIRIUM_IDENTITY_KEYRING_FILE);
  let data: ReturnType<typeof readExternalSecretKeyring> | undefined;
  try {
    data = readExternalSecretKeyring(process.env.ANIRIUM_DATA_KEYRING_FILE);
    for (const key of identity.keys.values()) {
      if ([...data.keys.values()].some(other => key.equals(other))) throw new Error("Identity and data keys must be distinct");
    }
    const message = JSON.stringify(["anirium.identity", 1, "google", subject]);
    return [...identity.keys].map(([keyId, key]) => ({
      keyId,
      hash: createHmac("sha256", key).update(message).digest("hex"),
      active: keyId === identity.activeKeyId,
    }));
  } finally {
    for (const key of identity.keys.values()) key.fill(0);
    for (const key of data?.keys.values() ?? []) key.fill(0);
  }
}
