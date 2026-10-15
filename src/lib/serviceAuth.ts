import crypto from "node:crypto";

const TOKEN_TTL_SECONDS = 5 * 60;
const secret = () => {
  const configured = process.env.ANIRIUM_SERVICE_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("ANIRIUM_SERVICE_SECRET is required in production");
  return "development-only-anirium-service-secret";
};

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function issueServiceToken(sessionId: string, deviceId: string, accountId: string, level: number, playerSessionId: string) {
  const payload = encode({ sessionId, deviceId, accountId, level, playerSessionId, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS });
  const signature = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export type ServiceTokenClaims = { sessionId: string; playerSessionId: string; deviceId: string; accountId: string; level: number; exp: number };
export type ServiceTokenFailureReason = "token_invalid" | "token_expired" | "device_mismatch" | "plus_required";
export type ServiceTokenVerification =
  | { ok: true; claims: ServiceTokenClaims }
  | { ok: false; reason: ServiceTokenFailureReason };

export function verifyServiceTokenDetailed(token: string, deviceId: string): ServiceTokenVerification {
  if (!deviceId || token.length > 8192) return { ok: false, reason: "token_invalid" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "token_invalid" };
  const [payload, signature] = parts;
  if (!payload || !signature || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) {
    return { ok: false, reason: "token_invalid" };
  }
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (signatureBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(signatureBytes, expectedBytes)) {
    return { ok: false, reason: "token_invalid" };
  }
  // Claims are classified only after the HMAC proves the token was issued by Core.
  let data: any;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "token_invalid" };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      typeof data.sessionId !== 'string' || !data.sessionId.trim() ||
      typeof data.accountId !== 'string' || !data.accountId.trim() ||
      typeof data.playerSessionId !== 'string' || !/^[a-zA-Z0-9-]{16,128}$/.test(data.playerSessionId) ||
      typeof data.deviceId !== 'string' || data.deviceId.length === 0 ||
      !Number.isSafeInteger(data.level) ||
      !Number.isSafeInteger(data.exp)) {
    return { ok: false, reason: "token_invalid" };
  }
  if (data.exp <= Math.floor(Date.now() / 1000)) return { ok: false, reason: "token_expired" };
  if (data.deviceId !== deviceId) return { ok: false, reason: "device_mismatch" };
  if (data.level < 2) return { ok: false, reason: "plus_required" };
  return { ok: true, claims: data as ServiceTokenClaims };
}

export function verifyServiceToken(token: string, deviceId: string) {
  const result = verifyServiceTokenDetailed(token, deviceId);
  return result.ok ? result.claims : null;
}
