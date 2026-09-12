import fs from "fs";
import path from "path";
import { DB } from "./types";
import { kvConfigured, kvLoad, kvSave } from "./kvStore";

// Two persistence backends, chosen automatically:
//
//  - File backend (default): a JSON file on disk (`data/db.json`). Perfect
//    for `next dev` / `next start` on a normal always-on process — your own
//    machine, a small VPS, Railway, Fly.io, Docker, etc.
//  - KV backend (when `KV_REST_API_URL`/`KV_REST_API_TOKEN` are set — that's
//    what Vercel's "KV" storage integration injects automatically): required
//    for stateless serverless hosting, where the filesystem can be
//    read-only and each invocation may land on a different instance, so a
//    local file can't be relied on to persist anything.
//
// Every other file in the app talks to the store only through `readDB()`
// and `withDB()`, so this is the only file that knows which backend is active.

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

function emptyDB(): DB {
  return {
    watchlist: [],
    cinemas: [],
    alertRules: [],
    sessions: [],
    notifications: [],
    lastPollAt: null,
    manualMovies: [],
    hiddenMovieIds: [],
    trackedReleaseDates: {},
    purchasedSessionIds: [],
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __cinemascoperDB: DB | undefined;
}

function loadFromDisk(): DB {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DB>;
    return { ...emptyDB(), ...parsed };
  } catch {
    return emptyDB();
  }
}

function persistToDisk(db: DB) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    // Best-effort persistence: a lean personal tool shouldn't crash a
    // request just because a write to disk failed (e.g. a read-only fs on
    // some hosting platforms). State still lives in memory for this process.
    console.error("[store] failed to persist db.json:", err);
  }
}

/**
 * Load the current store. With the file backend this is cached on
 * `globalThis` so repeated calls within the same process are cheap and
 * survive Next's dev-mode module hot-reloading; the KV backend always
 * fetches fresh, since a serverless instance shouldn't assume it's the only
 * one that might have written since its last read.
 */
async function loadDB(): Promise<DB> {
  if (kvConfigured()) {
    // Merged with emptyDB() the same way the file backend merges below —
    // a DB written by an older deploy (before a field like `manualMovies`
    // or `trackedReleaseDates` existed) would otherwise come back missing
    // those keys entirely and crash the first thing that reads them.
    return { ...emptyDB(), ...((await kvLoad()) ?? {}) };
  }
  if (!globalThis.__cinemascoperDB) {
    globalThis.__cinemascoperDB = loadFromDisk();
  }
  return globalThis.__cinemascoperDB;
}

async function saveDB(db: DB): Promise<void> {
  if (kvConfigured()) {
    await kvSave(db);
    return;
  }
  globalThis.__cinemascoperDB = db;
  persistToDisk(db);
}

/**
 * Mutate the store via `fn`, then persist the result. Returns `fn`'s return
 * value. `fn` may itself be async (real scrapers need to make network
 * calls) — it's always awaited before saving, so the save never races ahead
 * of an in-flight mutation.
 */
export async function withDB<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const db = await loadDB();
  const result = await fn(db);
  await saveDB(db);
  return result;
}

/** Read-only access to the current store snapshot. */
export async function readDB(): Promise<DB> {
  return loadDB();
}

/** Test/dev helper: wipe the store back to empty and persist. */
export async function resetDB() {
  await saveDB(emptyDB());
}

/**
 * Which backend is actually active right now — surfaced in the Settings
 * tab so "does my data actually save?" is something the app can answer
 * for itself instead of Connor having to guess. The file backend works
 * fine for local dev, but silently does *not* persist across cold starts
 * on Vercel's stateless functions (a fresh instance starts from an empty
 * in-memory DB and an unwritable-in-practice filesystem) — that mismatch,
 * not a code bug, is the usual cause of "my cinemas don't save".
 */
export function storageBackend(): "kv" | "file" {
  return kvConfigured() ? "kv" : "file";
}
