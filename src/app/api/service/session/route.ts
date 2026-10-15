import { readWebSessionId } from "@/lib/webSession";
import { NextRequest, NextResponse } from "next/server";
import { getActiveUserProfile } from "@/lib/userProfiles";
import { issueServiceToken } from "@/lib/serviceAuth";

import { acquireServiceLease, releasePlayerLease } from '@/lib/serviceSessions';

export async function GET(request: NextRequest) {
  const sessionId = readWebSessionId(request);
  const deviceId = request.headers.get("x-anirium-device")?.trim();
  const playerSessionId = request.headers.get("x-anirium-player-session") || "";
  if (!sessionId || !deviceId) return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  if (!/^[a-zA-Z0-9-]{16,128}$/.test(playerSessionId)) return NextResponse.json({ status: "unauthorized", reason: "player_session_required" }, { status: 400 });

  let user;
  try { user = await getActiveUserProfile(false, sessionId); }
  catch { return NextResponse.json({ status: "unavailable", reason: "core_unavailable" }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  if (!user) return NextResponse.json({ status: "unauthorized", reason: "session_revoked" }, { status: 401 });
  if (user.level_tier < 2) {
    return NextResponse.json({ status: "unauthorized", reason: "plus_required" }, { status: 403 });
  }

  const token = issueServiceToken(sessionId, deviceId, user.id, Number(user.level_tier), playerSessionId);
  let leaseAcquired: boolean;
  try {
    leaseAcquired = await acquireServiceLease(user.id, deviceId, sessionId, playerSessionId);
  } catch {
    return NextResponse.json({ status: "unavailable", reason: "core_unavailable" }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!leaseAcquired) {
    return NextResponse.json({ status: "session_in_use", reason: "session_in_use" }, { status: 409 });
  }

  return NextResponse.json({ status: "authorized", token, expiresIn: 300, deviceId }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: NextRequest) {
  const sessionId = readWebSessionId(request);
  const deviceId = request.headers.get("x-anirium-device")?.trim();
  const playerSessionId = request.headers.get("x-anirium-player-session") || "";
  if (!sessionId || !deviceId || !/^[a-zA-Z0-9-]{16,128}$/.test(playerSessionId)) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }
  let user;
  try { user = await getActiveUserProfile(false, sessionId); }
  catch { return NextResponse.json({ status: "unavailable", reason: "core_unavailable" }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  if (!user) return NextResponse.json({ status: "unauthorized", reason: "session_revoked" }, { status: 401 });
  try {
    await releasePlayerLease(user.id, deviceId, sessionId, playerSessionId);
  } catch {
    return NextResponse.json({ status: "unavailable", reason: "core_unavailable" }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
