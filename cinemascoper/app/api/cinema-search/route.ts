import { NextRequest, NextResponse } from "next/server";
import { searchCinemas } from "@/lib/cinemaSearch";

// No request-derived caching concerns here beyond the in-memory cache
// `lib/cinemaSearch.ts` already keeps — but this depends on query params,
// so it was never a static-render risk the way the parameterless routes
// were; no `dynamic = "force-dynamic"` needed.
export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider") ?? "";
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const results = await searchCinemas(provider, q);
  return NextResponse.json({ results });
}
