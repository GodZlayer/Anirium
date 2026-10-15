import { logServerFailure } from "@/lib/serverLog";
import { NextRequest, NextResponse } from "next/server";
import { getAiringSchedule, getLatestAiredEpisodes } from "@/lib/catalog";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "latest") {
      const latest = await getLatestAiredEpisodes(15);
      return NextResponse.json({ schedule: latest });
    }

    const schedule = await getAiringSchedule(1, 6);
    return NextResponse.json({ schedule });
  } catch (error) {
    logServerFailure("schedule", error);
    return NextResponse.json({ error: "Failed to fetch schedule" }, { status: 500 });
  }
}
