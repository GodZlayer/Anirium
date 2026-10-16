import { insertEntityComment } from "@/lib/entityCommentWriter";
import { getEntityActivity } from "@/lib/entityActivityReader";
import { readEntityStatusPageInput, getEntityStatusPage } from "@/lib/entityStatusPage";
import { readEntityCommentPageInput, getEntityCommentPage } from "@/lib/entityCommentPage";
import { logServerFailure } from "@/lib/serverLog";
import { requireUserWriteBudget, WriteBudgetExceeded } from "@/lib/writeBudget";
import { writeActivity, projectActivity } from "@/lib/privateActivity";
import { readApiJson, ApiInputError, validateWatchProgressInput, validateCanonicalEntityStatusInput, validateCommentInput, validateProfileUpdateInput, validateBookmarkInput, validateAddonToggleInput } from "@/lib/apiInput";
import { NextRequest, NextResponse } from "next/server";
import {
  getActiveUserProfile,
  clearActiveUserProfile,
  getAllProfiles,
  setActiveUserProfile,
  saveWatchProgress,
  getWatchHistory,
  toggleEntityBookmark,
  removeEntityBookmark,
  getUserBookmarks,
  getBookmarkItems,
  toggleUserAddon,
  upsertGoogleUserProfile,
  updateUserProfile,
  ExperienceLevel,
} from "@/lib/userProfiles";
import { query, queryOne } from "@/lib/postgres";
import { addonRegistry } from "@/lib/extensions/addonRegistry";
import { revokeServiceSession } from "@/lib/serviceSessions";
import { getWebSession, attachWebSessionCookie, clearWebSessionCookie } from "@/lib/webSession";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "get_active_user";
  const { sessionId, cookieValue, isNew } = getWebSession(request);

  try {
    if (action === "list_profiles") {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ success: false, reason: "trusted_account_flow_required" }, { status: 403 });
      }
      const profiles = await getAllProfiles();
      const res = NextResponse.json({ success: true, profiles });
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    if (action === "get_history") {
      const activeUser = await getActiveUserProfile(false, sessionId);
      if (!activeUser || activeUser.level_tier < 2) {
        const res = NextResponse.json({ success: true, history: [] });
        attachWebSessionCookie(res, cookieValue, request);
        return res;
      }
      const history = await getWatchHistory(activeUser.id);
      const res = NextResponse.json({ success: true, history });
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    if (action === "get_bookmarks") {
      const activeUser = await getActiveUserProfile(false, sessionId);
      if (!activeUser || activeUser.level_tier < 2) {
        const res = NextResponse.json({ success: true, bookmarks: [] });
        attachWebSessionCookie(res, cookieValue, request);
        return res;
      }
      const bookmarks = await getUserBookmarks(activeUser.id);
      const res = NextResponse.json({ success: true, bookmarks });
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    // Obter status/opinião detalhado de uma entidade (Franquia, Série, Temporada ou Episódio)
    if (action === "get_entity_status") {
      const input = readEntityCommentPageInput(searchParams);
      const { entityType, entityId } = input;
      validateCanonicalEntityStatusInput({entityType,entityId});
      const activeUser = await getActiveUserProfile(false, sessionId);

      let statusRow = null;
      if (activeUser && activeUser.level_tier >= 2) {
        statusRow = await getEntityActivity(activeUser.id,entityType!,entityId);
      }

      const page = await getEntityCommentPage(input);

      const res = NextResponse.json({
        success: true,
        status: statusRow?.canonical_entity_id === entityId ? {...statusRow,entity_id:entityId} : null,
        ...page,
        comments: page.comments.map(comment => ({...comment,entity_id:entityId})),
      }, { headers: { "Cache-Control": "private, no-store" } });
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    // Obter todos os status gravados do usuário nas 4 tipagens (Franquia, Série, Temporada, Episódio)
    if (action === "get_all_statuses") {
      const input = readEntityStatusPageInput(searchParams);
      const activeUser = await getActiveUserProfile(false, sessionId);
      if (!activeUser || activeUser.level_tier < 2) {
        const res = NextResponse.json({ success: true, statuses: [], nextCursor: null });
        attachWebSessionCookie(res, cookieValue, request);
        return res;
      }
      const page = await getEntityStatusPage(activeUser.id, input);
      const res = NextResponse.json({ success: true, ...page });
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    // Default: get active user with full context para a sessão isolada
    const activeUser = await getActiveUserProfile(false, sessionId);
    if (!activeUser) {
      const res = NextResponse.json({
        success: true,
        user: null,
        history: [],
        bookmarks: [],
        bookmarkItems: [],
        activeTheme: null,
      });
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    // Suspenso ou sem Anirium+: Desativa addons oficiais do usuário e limpa do runtime
    if (activeUser.level_tier < 2) {
      const nonOfficialAddons = (activeUser.enabledAddons || []).filter(
        (id: string) => id !== "player-pro" && !id.startsWith("official-")
      );
      addonRegistry.syncUserAddons(nonOfficialAddons);
    } else if (activeUser.enabledAddons) {
      addonRegistry.syncUserAddons(activeUser.enabledAddons);
    }

    const isPlusActive = activeUser.level_tier >= 2;
    const history = isPlusActive ? await getWatchHistory(activeUser.id) : [];
    const bookmarks = isPlusActive ? await getUserBookmarks(activeUser.id) : [];
    const bookmarkItems = isPlusActive ? await getBookmarkItems(activeUser.id) : [];

    const res = NextResponse.json({
      success: true,
      user: activeUser,
      history,
      bookmarks,
      bookmarkItems,
      activeTheme: addonRegistry.getActiveTheme(),
    });
    attachWebSessionCookie(res, cookieValue, request);
    return res;
  } catch (err: any) {
    if (err instanceof ApiInputError) return NextResponse.json({ success: false, error: err.reason, message: err.publicMessage }, { status: err.status, headers: { 'Cache-Control': 'no-store' } });
    logServerFailure("user", err);
    return NextResponse.json({ success: false, error: "Failed to load user data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { sessionId, cookieValue, isNew } = getWebSession(request);

  try {
    const body = await readApiJson(request);
    const { action } = body;
    // Open beta is a server policy, not a client-supplied paid entitlement.
    if (action === "activate_anirium_plus" && process.env.ANIRIUM_OPEN_BETA === "true") {
      if (isNew) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
      const activeUser = await getActiveUserProfile(false, sessionId);
      if (!activeUser || activeUser.level_tier < 1) {
        return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
      }
      // Never downgrade admins or replace an existing paid entitlement.
      if (activeUser.level_tier < 2) {
        await query(`UPDATE users SET level_tier = 2, badge_label = 'Anirium+ (Beta)',
          subscription_plan = 'open_beta', subscription_expires_at = NULL
          WHERE id = $1 AND level_tier = 1`, [activeUser.id]);
      }
      const user = await getActiveUserProfile(false, sessionId);
      const res = NextResponse.json({ success: true, user, activeTheme: addonRegistry.getActiveTheme() },
        { headers: { 'Cache-Control': 'no-store' } });
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }
    // Demo identity and self-issued entitlements must never authorize production
    // playback. Real Google credentials are verified by /api/auth/google.
    if (process.env.NODE_ENV === "production" &&
        ["switch_level", "switch_user", "google_login", "activate_anirium_plus"].includes(action)) {
      return NextResponse.json({ success: false, error: "Esta ação exige autenticação ou confirmação de plano pelo servidor", reason: "trusted_account_flow_required" }, { status: 403 });
    }

    if (action === "logout") {
      await revokeServiceSession(sessionId);
      await clearActiveUserProfile(sessionId);
      const res = NextResponse.json({
        success: true,
        user: null,
      });
      clearWebSessionCookie(res, request);
      return res;
    }

    if (action === "activate_anirium_plus") {
      const activeUser = await getActiveUserProfile(false, sessionId);
      if (!activeUser) {
        return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
      }
      const plan = body.plan || "trial_1d";
      const now = Date.now();
      let durationMs = 1 * 24 * 60 * 60 * 1000; // 1 dia default
      let badge = "Anirium+ (Trial)";

      if (plan === "1w") {
        durationMs = 7 * 24 * 60 * 60 * 1000;
        badge = "Anirium+";
      } else if (plan === "1m") {
        durationMs = 30 * 24 * 60 * 60 * 1000;
        badge = "Anirium+";
      } else if (plan === "1y") {
        durationMs = 365 * 24 * 60 * 60 * 1000;
        badge = "Anirium+";
      } else if (plan === "10y") {
        durationMs = 10 * 365 * 24 * 60 * 60 * 1000;
        badge = "Anirium+ Vitalício";
      }

      const expiresAt = now + durationMs;
      await query(
        `UPDATE users
         SET level_tier = 2, badge_label = $1, subscription_plan = $2, subscription_expires_at = $3
         WHERE id = $4`,
        [badge, plan, expiresAt, activeUser.id]
      );

      const updatedUser = await getActiveUserProfile(false, sessionId);
      if (updatedUser?.enabledAddons) {
        addonRegistry.syncUserAddons(updatedUser.enabledAddons);
      }
      const res = NextResponse.json({
        success: true,
        user: updatedUser,
        activeTheme: addonRegistry.getActiveTheme(),
      });
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    if (action === "switch_level") {
      const level = body.level as ExperienceLevel;
      if (level === 2) {
        // Garantir que ao ativar/alternar para Anirium+ haja ao menos um trial ativo de 24h caso não tenha
        const activeUser = await getActiveUserProfile(false, sessionId);
        if (activeUser && (!activeUser.subscriptionExpiresAt || Date.now() > activeUser.subscriptionExpiresAt)) {
          const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
          await query(
            `UPDATE users
             SET level_tier = 2, badge_label = 'Anirium+ (Trial)', subscription_plan = 'trial_1d', subscription_expires_at = $1
             WHERE id = $2`,
            [expiresAt, activeUser.id]
          );
        }
      }
      const updatedUser = await setActiveUserProfile(level, sessionId);
      if (updatedUser?.enabledAddons) {
        addonRegistry.syncUserAddons(updatedUser.enabledAddons);
      }
      const res = NextResponse.json({
        success: true,
        user: updatedUser,
        activeTheme: addonRegistry.getActiveTheme(),
      });
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    if (action === "switch_user") {
      const userId = body.userId as string;
      const updatedUser = await setActiveUserProfile(userId, sessionId);
      if (updatedUser?.enabledAddons) {
        addonRegistry.syncUserAddons(updatedUser.enabledAddons);
      }
      const res = NextResponse.json({
        success: true,
        user: updatedUser,
        activeTheme: addonRegistry.getActiveTheme(),
      });
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    if (action === "google_login") {
      const { googleId, email, name, avatarUrl } = body;
      if (!googleId || !email) {
        return NextResponse.json({ success: false, error: "googleId e email são obrigatórios" }, { status: 400 });
      }
      const updatedUser = await upsertGoogleUserProfile({
        googleId,
        email,
        name: name || email.split("@")[0],
        avatarUrl: avatarUrl || "",
      }, sessionId);
      if (updatedUser.enabledAddons) {
        addonRegistry.syncUserAddons(updatedUser.enabledAddons);
      }
      const res = NextResponse.json({
        success: true,
        user: updatedUser,
        activeTheme: addonRegistry.getActiveTheme(),
      });
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    if (action === "update_profile") {
      validateProfileUpdateInput(body);
      const activeUser = await getActiveUserProfile(false, sessionId);
      if (!activeUser) {
        return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
      }
      const { displayName, avatarUrl, settings } = body;
      await requireUserWriteBudget(activeUser.id, action);
      const updatedUser = await updateUserProfile(activeUser.id, {
        display_name: displayName,
        avatar_url: avatarUrl,
        settings,
      });
      const res = NextResponse.json({
        success: true,
        user: updatedUser,
        activeTheme: addonRegistry.getActiveTheme(),
      });
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    if (action === "save_progress") {
      const { animeId, seasonIdx, episode, progressSeconds, durationSeconds, seasonEntityId } = validateWatchProgressInput(body);
      const activeUser = await getActiveUserProfile(false, sessionId);
      if (!activeUser) {
        return NextResponse.json({ success: true, guest: true });
      }
      await requireUserWriteBudget(activeUser.id, action);
      await saveWatchProgress(
        activeUser.id,
        animeId,
        seasonIdx,
        episode,
        progressSeconds,
        durationSeconds,
        seasonEntityId
      );
      return NextResponse.json({ success: true });
    }

    // Avaliação e Opinião / Status de Franquia, Série, Temporada ou Episódio
    if (action === "save_entity_status") {
      validateCanonicalEntityStatusInput(body);
      const activeUser = await getActiveUserProfile(false, sessionId);
      if (!activeUser) {
        return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
      }
      const {
        entityType,
        entityId,
        parentSeriesId,
        seasonIdx,
        episodeNumber,
        status,
        userScore,
        externalScore,
        userOpinion,
        containsSpoilers,
      } = body;

      const privatePatch: Record<string, any> = {};
      await requireUserWriteBudget(activeUser.id, action);
      if (userScore !== undefined) privatePatch.user_score = userScore;
      if (externalScore !== undefined) privatePatch.external_source_score = externalScore;
      if (userOpinion !== undefined) privatePatch.user_opinion = userOpinion;
      await writeActivity(activeUser.id, entityType, entityId,
        { parentSeriesId, seasonIdx, episodeNumber, status, containsSpoilers }, privatePatch);

      return NextResponse.json({ success: true });
    }

    // Adicionar Comentário em qualquer status/entidade
    if (action === "add_comment") {
      validateCommentInput(body);
      validateCanonicalEntityStatusInput(body);
      const activeUser = await getActiveUserProfile(false, sessionId);
      if (!activeUser) {
        return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
      }
      const { entityType, entityId, parentSeriesId, episodeNumber, parentCommentId, content, isSpoiler } = body;

      if (!content || !content.trim()) {
        return NextResponse.json({ success: false, error: "Conteúdo do comentário é obrigatório" }, { status: 400 });
      }

      await requireUserWriteBudget(activeUser.id, action);
      const inserted = await insertEntityComment(activeUser.id,{entityType,entityId,parentSeriesId,episodeNumber,parentCommentId,content,isSpoiler});

      if (!inserted) return NextResponse.json({ success: false, error: "invalid_parent_comment" }, { status: 400 });
      return NextResponse.json({ success: true, commentId: inserted.id });
    }

    if (action === "toggle_bookmark" || action === "remove_bookmark") {
      validateBookmarkInput(body);
      const activeUser = await getActiveUserProfile(false, sessionId);
      if (!activeUser) {
        return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
      }
      if (activeUser.level_tier < 2) {
        return NextResponse.json({
          success: false,
          error: "Favoritos e Status Pro são exclusivos para assinantes Anirium+ ativos.",
        }, { status: 403 });
      }

      const { entityType, entityId, parentSeriesId, seasonIdx, episodeNumber, seasonEntityId } = body;
      await requireUserWriteBudget(activeUser.id, "toggle_bookmark");
      let isBookmarked = false;

      if (action === "remove_bookmark") {
        await removeEntityBookmark(activeUser.id, entityType, entityId);
      } else if (entityType && (entityId || (entityType === "EPISODE" && seasonEntityId))) {
        isBookmarked = await toggleEntityBookmark(
          activeUser.id,
          entityType,
          entityType === "EPISODE" ? seasonEntityId : entityId,
          parentSeriesId,
          seasonIdx,
          episodeNumber,
          seasonEntityId
        );
      }

      const bookmarks = await getUserBookmarks(activeUser.id, action === "remove_bookmark");
      const bookmarkItems = await getBookmarkItems(activeUser.id);
      return NextResponse.json({ success: true, isBookmarked, bookmarks, bookmarkItems }, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
    }

    if (action === "toggle_addon") {
      validateAddonToggleInput(body);
      const activeUser = await getActiveUserProfile(false, sessionId);
      if (!activeUser) {
        return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
      }
      const { addonId, enabled } = body;
      await requireUserWriteBudget(activeUser.id, action);
      await toggleUserAddon(activeUser.id, addonId, enabled);
      if (enabled) {
        addonRegistry.enableAddon(addonId);
      } else {
        addonRegistry.disableAddon(addonId);
      }
      const updatedUser = await getActiveUserProfile(false, sessionId);
      const res = NextResponse.json({
        success: true,
        user: updatedUser,
        activeTheme: addonRegistry.getActiveTheme(),
      });
      attachWebSessionCookie(res, cookieValue, request);
      return res;
    }

    return NextResponse.json({ success: false, error: "Ação não reconhecida" }, { status: 400 });
  } catch (err: any) {
    if (err instanceof WriteBudgetExceeded) return NextResponse.json({ success: false, error: "write_rate_limited" },
      { status: 429, headers: { "Retry-After": String(err.retryAfter), "Cache-Control": "no-store" } });
    if (err instanceof ApiInputError) return NextResponse.json({ success: false, error: err.reason, message: err.publicMessage }, { status: err.status, headers: { 'Cache-Control': 'no-store' } });
    logServerFailure("user", err);
    return NextResponse.json({ success: false, error: "Failed to update user data" }, { status: 500 });
  }
}
