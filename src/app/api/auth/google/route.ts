import { readApiJson, ApiInputError } from "@/lib/apiInput";
import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { upsertGoogleUserProfile, clearActiveUserProfile } from "@/lib/userProfiles";
import { addonRegistry } from "@/lib/extensions/addonRegistry";
import { createWebSession, readWebSessionId, attachWebSessionCookie } from "@/lib/webSession";
import { revokeServiceSession } from "@/lib/serviceSessions";

const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

export async function POST(request: NextRequest) {
  // Authentication always issues a fresh, server-selected credential. Neither
  // a supplied header nor a pre-login cookie determines the new session.
  const { sessionId, cookieValue } = createWebSession();
  const previousSessionId = readWebSessionId(request);

  try {
    const body = await readApiJson(request);
    const { credential, code, redirectUri } = body;

    // Cenário 1: Token ID / Credencial do Google Identity Services (One Tap ou Sign-in button)
    if (credential) {
      if (!clientId) {
        return NextResponse.json(
          { success: false, error: "GOOGLE_CLIENT_ID não configurado no servidor" },
          { status: 500 }
        );
      }

      const client = new OAuth2Client(clientId);
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.sub || !payload.email || payload.email_verified !== true) {
        return NextResponse.json(
          { success: false, error: "Token Google inválido ou incompleto" },
          { status: 400 }
        );
      }

      const user = await upsertGoogleUserProfile(
        {
          googleId: payload.sub,
          email: payload.email,
          name: payload.name || "",
          avatarUrl: payload.picture || "",
        },
        sessionId
      );

      if (user.enabledAddons) {
        addonRegistry.syncUserAddons(user.enabledAddons);
      }

      const res = NextResponse.json({
        success: true,
        user,
        activeTheme: addonRegistry.getActiveTheme(),
      });
      if (previousSessionId) {
        await revokeServiceSession(previousSessionId);
        await clearActiveUserProfile(previousSessionId);
      }
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    // Cenário 2: Authorization Code Flow (OAuth 2.0 padrão via redirect ou popup)
    if (code) {
      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { success: false, error: "GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET não configurados" },
          { status: 500 }
        );
      }

      const client = new OAuth2Client(clientId, clientSecret, redirectUri || "postmessage");
      const { tokens } = await client.getToken(code);

      if (!tokens.id_token) {
        return NextResponse.json(
          { success: false, error: "Falha ao obter id_token do Google" },
          { status: 400 }
        );
      }

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: clientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.sub || !payload.email || payload.email_verified !== true) {
        return NextResponse.json(
          { success: false, error: "Payload do token Google inválido" },
          { status: 400 }
        );
      }

      const user = await upsertGoogleUserProfile(
        {
          googleId: payload.sub,
          email: payload.email,
          name: payload.name || "",
          avatarUrl: payload.picture || "",
        },
        sessionId
      );

      if (user.enabledAddons) {
        addonRegistry.syncUserAddons(user.enabledAddons);
      }

      const res = NextResponse.json({
        success: true,
        user,
        activeTheme: addonRegistry.getActiveTheme(),
      });
      if (previousSessionId) {
        await revokeServiceSession(previousSessionId);
        await clearActiveUserProfile(previousSessionId);
      }
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    return NextResponse.json(
      { success: false, error: "Nenhuma credencial ou código fornecido" },
      { status: 400 }
    );
  } catch (err: any) {
    if (err instanceof ApiInputError) return NextResponse.json({ success: false, error: err.reason }, { status: err.status });
    console.error("[Google OAuth API] Falha na autenticação ou persistência da sessão");
    return NextResponse.json(
      { success: false, error: "Não foi possível concluir a autenticação Google" },
      { status: 500 }
    );
  }
}
