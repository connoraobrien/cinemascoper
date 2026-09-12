import { NextResponse } from "next/server";
import { buildState } from "@/lib/apiState";

// This handler has no request-derived inputs, so Next.js would otherwise be
// free to statically render it once at build time and serve that snapshot
// forever. It reads the live (file-backed) store on every call, so it must
// stay dynamic.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await buildState());
}
