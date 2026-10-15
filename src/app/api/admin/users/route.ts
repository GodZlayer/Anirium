import { logServerFailure } from "@/lib/serverLog";
import { readApiJson, ApiInputError } from "@/lib/apiInput";
import { readWebSessionId } from "@/lib/webSession";
import { NextRequest, NextResponse } from "next/server";
import { getActiveUserProfile, ExperienceLevel } from "@/lib/userProfiles";
import { query, queryOne } from "@/lib/postgres";
import { readProfile } from "@/lib/privateProfile";

async function getRequestAdmin(request: NextRequest) {
  const sessionId = readWebSessionId(request);
  if (!sessionId) return null;
  return getActiveUserProfile(false, sessionId);
}

// API exclusiva de Administração (Apenas Nível 3 / Admin)
// Exibe todas as contas, seus tiers e permite controle de assinatura Anirium+ (Nível 2)
export async function GET(request: NextRequest) {
  try {
    const activeUser = await getRequestAdmin(request);
    if (!activeUser || activeUser.level_tier !== 3) {
      return NextResponse.json({ success: false, error: "Acesso restrito ao Administrador" }, { status: 403 });
    }

    const users = await query<any>(
      `SELECT id, username, display_name, avatar_url, profile_private, level_tier, badge_label, created_at, subscription_plan, subscription_expires_at
       FROM users
       ORDER BY created_at DESC`
    );

    const now = Date.now();
    return NextResponse.json({
      success: true,
      users: users.map((u) => {
        const identity = readProfile(u);
        const subExpiresAt = u.subscription_expires_at ? Number(u.subscription_expires_at) : null;
        const isExpired = Number(u.level_tier) === 2 && subExpiresAt && now > subExpiresAt;
        const actualTier = isExpired ? 1 : Number(u.level_tier);
        const actualBadge = isExpired ? "Membro" : u.badge_label;

        return {
          id: u.id,
          username: u.username,
          displayName: identity.displayName,
          avatarUrl: identity.avatarUrl,
          levelTier: actualTier,
          badgeLabel: actualBadge,
          createdAt: Number(u.created_at),
          isPro: actualTier === 2,
          subscriptionPlan: actualTier === 2 ? u.subscription_plan : null,
          subscriptionExpiresAt: actualTier === 2 ? subExpiresAt : null,
        };
      }),
    }, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
  } catch (err: any) {
    if (err instanceof ApiInputError) return NextResponse.json({ success: false, error: err.reason }, { status: err.status });
    logServerFailure("admin", err);
    return NextResponse.json({ success: false, error: "Failed to process admin request" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const activeUser = await getRequestAdmin(request);
    if (!activeUser || activeUser.level_tier !== 3) {
      return NextResponse.json({ success: false, error: "Acesso restrito ao Administrador" }, { status: 403 });
    }

    const body = await readApiJson(request);
    const { action, targetUserId, newTier, plan } = body;

    // Ação: Atualizar status de assinatura Anirium+ (com suporte a planos com tempo de expiração)
    if (action === "toggle_anirium_plus" || action === "set_tier") {
      if (!targetUserId) {
        return NextResponse.json({ success: false, error: "targetUserId é obrigatório" }, { status: 400 });
      }

      // Impede rebaixar a própria conta de Admin (Nível 3)
      if (targetUserId === activeUser.id && newTier !== 3) {
        return NextResponse.json({ success: false, error: "Você não pode remover seu próprio acesso de Administrador" }, { status: 400 });
      }

      const tier = Number(newTier) as ExperienceLevel;
      if (!Number.isInteger(tier) || ![0, 1, 2, 3].includes(tier)) {
        return NextResponse.json({ success: false, error: "Nível de conta inválido" }, { status: 400 });
      }
      if (tier === 2 && plan !== undefined && !["trial_1d", "1w", "1m", "1y", "10y"].includes(plan)) {
        return NextResponse.json({ success: false, error: "Plano inválido" }, { status: 400 });
      }

      let subPlan: string | null = null;
      let expiresAt: number | null = null;
      let badge = "Membro";

      if (tier === 3) {
        badge = "Admin";
      } else if (tier === 2) {
        // Planos suportados:
        // 'trial_1d': 1 dia trial
        // '1w': 1 semana
        // '1m': 1 mês
        // '1y': 1 ano
        // '10y': 10 anos
        subPlan = plan || "trial_1d";
        const now = Date.now();

        if (subPlan === "trial_1d") {
          expiresAt = now + 1 * 24 * 60 * 60 * 1000; // 1 dia
          badge = "Anirium+ (Trial)";
        } else if (subPlan === "1w") {
          expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 1 semana
          badge = "Anirium+";
        } else if (subPlan === "1m") {
          expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 1 mês
          badge = "Anirium+";
        } else if (subPlan === "1y") {
          expiresAt = now + 365 * 24 * 60 * 60 * 1000; // 1 ano
          badge = "Anirium+";
        } else if (subPlan === "10y") {
          expiresAt = now + 3650 * 24 * 60 * 60 * 1000; // 10 anos
          badge = "Anirium+";
        } else {
          expiresAt = now + 1 * 24 * 60 * 60 * 1000;
          badge = "Anirium+ (Trial)";
        }
      }

      await query(
        `UPDATE users
         SET level_tier = $1, badge_label = $2, subscription_plan = $3, subscription_expires_at = $4
         WHERE id = $5`,
        [tier, badge, subPlan, expiresAt, targetUserId]
      );

      return NextResponse.json({
        success: true,
        targetUserId,
        levelTier: tier,
        badgeLabel: badge,
        subscriptionPlan: subPlan,
        subscriptionExpiresAt: expiresAt,
      });
    }

    return NextResponse.json({ success: false, error: "Ação não suportada" }, { status: 400 });
  } catch (err: any) {
    if (err instanceof ApiInputError) return NextResponse.json({ success: false, error: err.reason }, { status: err.status });
    logServerFailure("admin", err);
    return NextResponse.json({ success: false, error: "Failed to process admin request" }, { status: 500 });
  }
}
