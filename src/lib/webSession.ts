import { randomBytes, createHash } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

// The __Host prefix prohibits Domain and requires Secure + path=/, so another
// subdomain cannot plant the production browser session cookie.
export const WEB_SESSION_COOKIE = process.env.NODE_ENV === "production"
  ? "__Host-anirium_web_session" : "anirium_web_session";
export const WEB_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const validCookie = /^[a-f0-9]{64}$/;

function sessionKey(cookieValue: string) {
  // A database read must not disclose a reusable browser bearer credential.
  return "web-" + createHash("sha256").update(cookieValue).digest("hex");
}

export function createWebSession() {
  const cookieValue = randomBytes(32).toString("hex");
  return { cookieValue, sessionId: sessionKey(cookieValue), isNew: true };
}

export function readWebSessionId(request: NextRequest): string {
  const value = request.cookies.get(WEB_SESSION_COOKIE)?.value || "";
  return validCookie.test(value) ? sessionKey(value) : "";
}

export function getWebSession(request: NextRequest) {
  const cookieValue = request.cookies.get(WEB_SESSION_COOKIE)?.value || "";
  return validCookie.test(cookieValue)
    ? { cookieValue, sessionId: sessionKey(cookieValue), isNew: false }
    : createWebSession();
}

export function attachWebSessionCookie(response: NextResponse, cookieValue: string, request: NextRequest) {
  response.cookies.set(WEB_SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: WEB_SESSION_MAX_AGE_SECONDS,
  });
  // The legacy bearer was readable by scripts. Never upgrade it into a trusted
  // session; require normal login again and remove the old browser cookie.
  response.cookies.set("anirium_session", "", { httpOnly: true,
    secure: process.env.NODE_ENV === "production" || request.nextUrl.protocol === "https:",
    sameSite: "lax", path: "/", maxAge: 0 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function clearWebSessionCookie(response: NextResponse, request: NextRequest) {
  attachWebSessionCookie(response, "", request);
  response.cookies.set(WEB_SESSION_COOKIE, "", { httpOnly: true,
    secure: process.env.NODE_ENV === "production" || request.nextUrl.protocol === "https:",
    sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
