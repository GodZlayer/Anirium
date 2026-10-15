import { NextRequest, NextResponse } from "next/server";
import { searchAnimes } from "@/lib/catalog";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchAnimes(q);
  return NextResponse.json({ results });
}
