import { NextRequest, NextResponse } from "next/server";
import { getActiveUserProfile, getUserInstalledAddons } from "@/lib/userProfiles";
import { verifyServiceTokenDetailed } from "@/lib/serviceAuth";
import { validateServiceLease } from '@/lib/serviceSessions';
import { projectAuthorizedAddons } from '@/lib/addonAuthorization';

// Diagnose latency without logging account identifiers, tokens or error text.
async function observeAuthorizationStage<T>(stage: 'profile' | 'lease' | 'addons', operation: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const pending = setTimeout(() => console.info(`[ServiceAuthorization] stage=${stage} pending_ms=${Date.now() - started}`), 1000);
  try { return await operation(); }
  finally {
    clearTimeout(pending);
    const elapsed = Date.now() - started;
    if (elapsed >= 1000) console.info(`[ServiceAuthorization] stage=${stage} completed_ms=${elapsed}`);
  }
}

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const deviceId = request.headers.get("x-anirium-device") || "";
  const verification = verifyServiceTokenDetailed(token, deviceId);
  if (!verification.ok) {
    if (verification.reason === "plus_required") {
      return NextResponse.json({ status: "unauthorized", reason: "plus_required" }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ status: "unauthorized", reason: verification.reason }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const claims = verification.claims;
  console.info('[ServiceAuthorization] entered');
  let user;
  try { user = await observeAuthorizationStage('profile', () => getActiveUserProfile(false, claims.sessionId)); }
  catch { return NextResponse.json({ status: "unavailable", reason: "core_unavailable" }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  if (!user) return NextResponse.json({ status: "unauthorized", reason: "session_revoked" }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (user.level_tier < 2) return NextResponse.json({ status: "unauthorized", reason: "plus_required" }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (user.id !== claims.accountId) return NextResponse.json({ status: "unauthorized", reason: "account_mismatch" }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  let leaseValid: boolean;
  try { leaseValid = await observeAuthorizationStage('lease', () => validateServiceLease(user.id, deviceId, claims.sessionId, claims.playerSessionId)); }
  catch { return NextResponse.json({ status: "unavailable", reason: "core_unavailable" }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  if (!leaseValid) {
    return NextResponse.json({ status: "unauthorized", reason: "session_mismatch" }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  // Relay account-owned configuration only. The Service interprets capabilities
  // and contacts remote endpoints; Core never executes source providers.
  let installed;
  try { installed = await observeAuthorizationStage('addons', () => getUserInstalledAddons(user.id)); }
  catch { return NextResponse.json({ status: "unavailable", reason: "core_unavailable" }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  const installedAddons = projectAuthorizedAddons(installed,user.enabledAddons || []);
  return NextResponse.json({ status: "authorized", accountId: user.id, level: user.level_tier, playerSessionId: claims.playerSessionId,
    authorizedAddonIds: user.enabledAddons || [], installedAddons },
    { headers: { 'Cache-Control': 'no-store' } });
}
