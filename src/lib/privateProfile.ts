import { validateProfileUpdateInput } from "./apiInput";
import { encryptPrivateJson, decryptPrivateJson, isPrivateEnvelope, type PrivateDataContext } from "./privateData";

export type PrivateProfile = { displayName: string; avatarUrl: string };
type StoredProfile = { id: string; profile_private?: unknown; display_name?: unknown; avatar_url?: unknown };

export function profilePrivateContext(id: string): PrivateDataContext {
  if (typeof id !== "string" || !id || id.length > 256) throw new Error("Invalid profile identity");
  return { table: "users", owner: id, record: id, field: "profile_private" };
}

function checkedProfile(value: unknown): PrivateProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid private profile");
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).length !== 2 || typeof fields.displayName !== "string" || typeof fields.avatarUrl !== "string") {
    throw new Error("Invalid private profile");
  }
  validateProfileUpdateInput(fields);
  return { displayName: fields.displayName, avatarUrl: fields.avatarUrl };
}

export function encodeProfile(id: string, displayName: string, avatarUrl: string) {
  return encryptPrivateJson(checkedProfile({ displayName, avatarUrl }), profilePrivateContext(id));
}

export function readProfile(row: StoredProfile): PrivateProfile {
  const context = profilePrivateContext(row.id);
  if (!isPrivateEnvelope(row.profile_private)) throw new Error("Private profile requires migration");
  return checkedProfile(decryptPrivateJson(row.profile_private, context));
}
