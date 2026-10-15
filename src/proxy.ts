import { NextRequest, NextResponse } from "next/server";
import { checkApiRequest } from "./lib/requestSecurity";
import { randomBytes } from "node:crypto";
import { contentSecurityPolicy } from "./lib/contentSecurityPolicy";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") || "";
  if (host.includes("api.anirium.com.br") && !request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("https://anirium.com.br" + request.nextUrl.pathname, request.url), 302);
  }

  if (!request.nextUrl.pathname.startsWith("/api/")) {
    const nonce = randomBytes(24).toString("base64");
    const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
    const headers = new Headers(request.headers);
    // Overwrite supplied values: an incoming client cannot select its nonce.
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", policy);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("Content-Security-Policy", policy);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  // Handle CORS Preflight for API
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = (origin === "https://anirium.com.br" || origin === "http://localhost:3000") ? origin : "https://anirium.com.br";

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-requested-with",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const failure = checkApiRequest(request, process.env.NODE_ENV === "production",
    process.env.ANIRIUM_PUBLIC_ORIGIN || "https://anirium.com.br");
  const response = failure
    ? NextResponse.json({ error: failure.reason }, { status: failure.status })
    : NextResponse.next();

  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-requested-with");
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export const config = { matcher: "/((?!_next/static|_next/image|assets/|downloads/|favicon).*)" };
