import { logServerFailure } from "@/lib/serverLog";
import { NextResponse } from "next/server";
import {
  getSeasonalAnimes,
  getPopularAnimes,
  getUpcomingAnimes,
  getAnimesFromCatalog,
  getUniversesFromCatalog,
  getCatalogCounts,
} from "@/lib/catalog";

export async function GET() {
  try {
    const [seasonal, popular, upcoming, counts] = await Promise.all([
      getSeasonalAnimes(),
      getPopularAnimes(),
      getUpcomingAnimes(),
      getCatalogCounts(),
    ]);

    // Consultas canônicas instantâneas do PostgreSQL no Anirium
    const allLocal = await getAnimesFromCatalog(undefined, 1000);
    const universes = await getUniversesFromCatalog();

    return NextResponse.json({
      seasonal,
      popular,
      upcoming,
      all: allLocal,
      universes,
      counts,
    });
  } catch (error) {
    logServerFailure("catalog", error);
    return NextResponse.json({ error: "Failed to load catalog" }, { status: 500 });
  }
}

