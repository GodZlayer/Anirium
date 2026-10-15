import { getSeasonProgress } from "@/lib/seasonProgressReader";
import { ApiInputError } from "@/lib/apiInput";
import { logServerFailure } from "@/lib/serverLog";
import { readWebSessionId } from "@/lib/webSession";
import { NextRequest, NextResponse } from "next/server";
import { getActiveUserProfile } from "@/lib/userProfiles";

/**
 * Endpoint de telemetria exata do progresso de episódios por anime e temporada.
 * Totalmente conectado ao PostgreSQL (user_entity_status) - Sem mock, sem polling.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const animeId = searchParams.get("animeId");
  const sessionId = readWebSessionId(req);
  const seasonText = searchParams.get("seasonIdx") ?? "0";
  const seasonEntityId = searchParams.get("seasonEntityId");
  const episodeEntityId = searchParams.get("episodeEntityId");
  if (searchParams.getAll("episodeEntityId").length > 1 || (episodeEntityId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(episodeEntityId))) return NextResponse.json({success:false,error:"invalid_episode"},{status:400});
  if (searchParams.getAll("seasonIdx").length > 1 || searchParams.getAll("seasonEntityId").length > 1 || !/^(0|[1-9][0-9]*)$/.test(seasonText) || Number(seasonText)>2147483647) return NextResponse.json({success:false,error:"invalid_season"},{status:400});

  if (searchParams.getAll("animeId").length !== 1 || !animeId || !/^[1-9][0-9]{0,9}$/.test(animeId) || Number(animeId) > 2147483647) {
    return NextResponse.json({ success: false, error: "invalid_anime_id" }, { status: 400 });
  }

  if (!seasonEntityId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seasonEntityId)) return NextResponse.json({success:false,error:"invalid_season"},{status:400});

  try {
    const activeUser = await getActiveUserProfile(false, sessionId);
    if (!activeUser) {
      return NextResponse.json({
        success: true,
        animeId,
        userId: null,
        episodes: [],
      });
    }

    const episodes = await getSeasonProgress(activeUser.id,Number(animeId),Number(seasonText),seasonEntityId,episodeEntityId ?? undefined);
    return NextResponse.json({success:true,animeId,userId:activeUser.id,episodes},{headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    if (error instanceof ApiInputError) return NextResponse.json({success:false,error:error.reason},{status:error.status});
    logServerFailure("progress", error);
    return NextResponse.json({ success: false, error: "Failed to load progress" }, { status: 500 });
  }
}

export const POST = GET;
