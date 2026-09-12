import { DB } from "./types";

// Optional persistence backend for stateless serverless hosting (e.g.
// Vercel's default functions), where the JSON-file store in `store.ts`
// doesn't survive between invocations. Point this at any Upstash-compatible
// Redis REST endpoint — that's exactly what Vercel's own "KV" storage
// integration provisions, and it auto-injects these two env var names into
// your project, so there's no code to change: just add the integration and
// redeploy.
//
// Talks to the REST API directly with `fetch` rather than pulling in the
// `@vercel/kv` package — this app has zero runtime dependencies beyond
// Next/React/Tailwind, and a single GET/SET pair is all a single-user app
// like this one needs.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KV_KEY = "cinemascoper:db";

export function kvConfigured(): boolean {
  return Boolean(KV_URL && KV_TOKEN);
}

export async function kvLoad(): Promise<DB | null> {
  if (!KV_URL || !KV_TOKEN) return null;

  const res = await fetch(`${KV_URL}/get/${KV_KEY}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`[kvStore] read failed (${res.status})`);
  }
  const body = (await res.json()) as { result: string | null };
  if (!body.result) return null;

  try {
    return JSON.parse(body.result) as DB;
  } catch {
    console.error("[kvStore] stored value wasn't valid JSON; starting fresh");
    return null;
  }
}

export async function kvSave(db: DB): Promise<void> {
  if (!KV_URL || !KV_TOKEN) return;

  const res = await fetch(`${KV_URL}/set/${KV_KEY}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "text/plain",
    },
    body: JSON.stringify(db),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`[kvStore] write failed (${res.status})`);
  }
}
