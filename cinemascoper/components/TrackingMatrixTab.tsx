"use client";

import { useEffect, useMemo, useState } from "react";
import { Cinema, WatchlistMovie, JoinedAlertRule, JoinedSession, CinemaProvider } from "@/lib/clientTypes";
import { EmptyState, IconButton, SectionHeading } from "./ui";
import { PlusIcon, TrashIcon } from "./Icons";
import { formatDateTime } from "@/lib/dateUtils";

interface ProviderOption {
  value: CinemaProvider;
  label: string;
  hint: string;
  needsSearch: boolean;
  fixed?: { name: string; city: string; suburb: string };
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  { value: "hoyts", label: "Hoyts", hint: "Search by venue name (e.g. \"Broadway\").", needsSearch: true },
  {
    value: "event",
    label: "Event Cinemas",
    hint: "Includes IMAX Sydney — search for it by name too.",
    needsSearch: true,
  },
  { value: "dendy", label: "Dendy", hint: "Newtown, Canberra, Coorparoo, Portside or Southport.", needsSearch: true },
  {
    value: "golden-age",
    label: "Golden Age Cinema & Bar",
    hint: "Surry Hills, Sydney.",
    needsSearch: false,
    fixed: { name: "Golden Age Cinema & Bar", city: "Sydney", suburb: "Surry Hills" },
  },
  {
    value: "ritz-randwick",
    label: "Ritz Randwick",
    hint: "Randwick, Sydney.",
    needsSearch: false,
    fixed: { name: "Ritz Randwick", city: "Sydney", suburb: "Randwick" },
  },
  {
    value: "flicks",
    label: "Any other cinema",
    hint: "Search flicks.com.au's national listing — covers almost any AU cinema.",
    needsSearch: true,
  },
];

function providerLabel(provider: CinemaProvider): string {
  return PROVIDER_OPTIONS.find((p) => p.value === provider)?.label ?? provider;
}

interface SearchResult {
  providerId: string;
  name: string;
  suburb?: string;
  state?: string;
}

function AddCinemaForm({
  onAddCinema,
}: {
  onAddCinema: (input: { name: string; city: string; suburb: string; provider: string; providerId: string }) => void;
}) {
  const [provider, setProvider] = useState<CinemaProvider>("hoyts");
  const option = PROVIDER_OPTIONS.find((p) => p.value === provider)!;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [name, setName] = useState("");
  const [suburb, setSuburb] = useState("");

  // Reset the picker whenever the provider changes so a stale selection
  // from a different provider's search results can't slip through.
  useEffect(() => {
    setQuery("");
    setResults([]);
    setSelected(null);
    if (option.fixed) {
      setName(option.fixed.name);
      setSuburb(option.fixed.suburb);
    } else {
      setName("");
      setSuburb("");
    }
  }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!option.needsSearch) return;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/cinema-search?provider=${provider}&q=${encodeURIComponent(query)}`);
        const { results } = await res.json();
        setResults(results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [provider, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = option.fixed ? Boolean(name.trim()) : Boolean(selected && name.trim());

  const submit = () => {
    if (!canSubmit) return;
    onAddCinema({
      name: name.trim(),
      city: option.fixed?.city ?? selected?.state ?? "",
      suburb: suburb.trim(),
      provider,
      providerId: option.fixed ? "" : selected?.providerId ?? "",
    });
    setQuery("");
    setResults([]);
    setSelected(null);
    if (!option.fixed) {
      setName("");
      setSuburb("");
    }
  };

  return (
    <div className="flex flex-col gap-2.5 border-t border-base-800 pt-3">
      <select
        value={provider}
        onChange={(e) => setProvider(e.target.value as CinemaProvider)}
        className="w-full rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 focus:border-accent-dim focus:outline-none"
      >
        {PROVIDER_OPTIONS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-base-500">{option.hint}</p>

      {option.needsSearch && (
        <div>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            placeholder={`Search ${option.label} venues by name…`}
            className="w-full rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 placeholder:text-base-600 focus:border-accent-dim focus:outline-none"
          />
          {(searching || results.length > 0) && (
            <ul className="mt-1.5 flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-base-800 bg-base-850 p-1.5">
              {searching && <li className="px-2 py-1 text-xs text-base-500">Searching…</li>}
              {!searching &&
                results.map((r) => (
                  <li key={r.providerId}>
                    <button
                      onClick={() => {
                        setSelected(r);
                        setName(r.name);
                        setSuburb(r.suburb ?? "");
                      }}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        selected?.providerId === r.providerId
                          ? "bg-accent-soft text-accent"
                          : "text-base-300 hover:bg-base-800 hover:text-base-100"
                      }`}
                    >
                      {r.name}
                      {r.suburb && <span className="text-base-500"> &middot; {r.suburb}</span>}
                    </button>
                  </li>
                ))}
              {!searching && results.length === 0 && (
                <li className="px-2 py-1 text-xs text-base-500">No matches yet — try a different search.</li>
              )}
            </ul>
          )}
        </div>
      )}

      {(selected || option.fixed) && (
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            className="flex-1 rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 focus:border-accent-dim focus:outline-none"
          />
          <input
            value={suburb}
            onChange={(e) => setSuburb(e.target.value)}
            placeholder="Suburb"
            className="w-32 rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 focus:border-accent-dim focus:outline-none"
          />
        </div>
      )}

      <button
        disabled={!canSubmit}
        onClick={submit}
        className="inline-flex items-center justify-center gap-1 rounded-lg border border-accent-dim/50 bg-accent-soft px-3 py-2 text-sm font-medium text-accent hover:bg-accent-soft/80 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <PlusIcon className="h-3.5 w-3.5" /> Add cinema
      </button>
    </div>
  );
}

export function TrackingMatrixTab({
  cinemas,
  watchlist,
  alertRules,
  sessions,
  onAddCinema,
  onRemoveCinema,
  onAddRule,
  onRemoveRule,
}: {
  cinemas: Cinema[];
  watchlist: WatchlistMovie[];
  alertRules: JoinedAlertRule[];
  sessions: JoinedSession[];
  onAddCinema: (input: { name: string; city: string; suburb: string; provider: string; providerId: string }) => void;
  onRemoveCinema: (cinemaId: string) => void;
  onAddRule: (input: { cinemaId: string; type: "blanket" | "targeted"; movieId?: string }) => void;
  onRemoveRule: (id: string) => void;
}) {
  const [ruleCinema, setRuleCinema] = useState<string>("");
  const [ruleType, setRuleType] = useState<"blanket" | "targeted">("blanket");
  const [ruleMovie, setRuleMovie] = useState<string>("");

  const effectiveRuleCinema = cinemas.some((c) => c.id === ruleCinema) ? ruleCinema : cinemas[0]?.id ?? "";
  const effectiveRuleMovie = watchlist.some((m) => m.id === ruleMovie) ? ruleMovie : watchlist[0]?.id ?? "";

  const canAddRule = cinemas.length > 0 && (ruleType === "blanket" || watchlist.length > 0);

  const myCinemaIdSet = useMemo(() => new Set(cinemas.map((c) => c.id)), [cinemas]);
  const matrixRows = watchlist.map((movie) => ({
    movie,
    sessions: sessions.filter((s) => s.movieId === movie.id && myCinemaIdSet.has(s.cinemaId)),
  }));

  return (
    <div>
      <SectionHeading
        title="Cinema & Movie Tracking Matrix"
        subtitle="Add any cinema you want session alerts from, then decide what to be alerted about at each one."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* My Cinemas */}
        <div className="rounded-xl border border-base-700 bg-base-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-base-100">My Cinemas ({cinemas.length})</h3>

          {cinemas.length === 0 ? (
            <EmptyState title="No cinemas added yet." hint="Add one below to start monitoring it." />
          ) : (
            <ul className="mb-3 flex flex-col gap-1.5">
              {cinemas.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-base-800 bg-base-850 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-base-100">{c.name}</p>
                    <p className="text-xs text-base-500">
                      {providerLabel(c.provider)}
                      {c.suburb ? ` · ${c.suburb}` : ""}
                    </p>
                  </div>
                  <IconButton variant="danger" title="Stop tracking this cinema" onClick={() => onRemoveCinema(c.id)}>
                    <TrashIcon className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}

          <AddCinemaForm onAddCinema={onAddCinema} />
        </div>

        {/* Alert Rules */}
        <div className="rounded-xl border border-base-700 bg-base-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-base-100">Alert Rules ({alertRules.length})</h3>

          {alertRules.length === 0 ? (
            <EmptyState title="No alert rules yet." hint="Blanket rules watch a whole cinema; targeted rules watch one movie there." />
          ) : (
            <ul className="mb-3 flex flex-col gap-1.5">
              {alertRules.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-base-800 bg-base-850 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-base-100">{r.cinemaName}</p>
                    <p className="text-xs text-base-500">
                      {r.type === "blanket" ? "Any new session" : `Only "${r.movieTitle}"`}
                    </p>
                  </div>
                  <IconButton variant="danger" title="Remove rule" onClick={() => onRemoveRule(r.id)}>
                    <TrashIcon className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2 border-t border-base-800 pt-3">
            <div className="flex gap-2">
              <select
                value={effectiveRuleCinema}
                onChange={(e) => setRuleCinema(e.target.value)}
                disabled={cinemas.length === 0}
                className="flex-1 rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 focus:border-accent-dim focus:outline-none disabled:opacity-50"
              >
                {cinemas.length === 0 ? (
                  <option>Add a cinema first</option>
                ) : (
                  cinemas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>

              <select
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value as "blanket" | "targeted")}
                className="rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 focus:border-accent-dim focus:outline-none"
              >
                <option value="blanket">Blanket</option>
                <option value="targeted">Targeted</option>
              </select>
            </div>

            {ruleType === "targeted" && (
              <select
                value={effectiveRuleMovie}
                onChange={(e) => setRuleMovie(e.target.value)}
                disabled={watchlist.length === 0}
                className="rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 focus:border-accent-dim focus:outline-none disabled:opacity-50"
              >
                {watchlist.length === 0 ? (
                  <option>Track a movie first</option>
                ) : (
                  watchlist.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))
                )}
              </select>
            )}

            <button
              disabled={!canAddRule}
              onClick={() =>
                onAddRule({
                  cinemaId: effectiveRuleCinema,
                  type: ruleType,
                  movieId: ruleType === "targeted" ? effectiveRuleMovie : undefined,
                })
              }
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-accent-dim/50 bg-accent-soft px-3 py-2 text-sm font-medium text-accent hover:bg-accent-soft/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PlusIcon className="h-3.5 w-3.5" /> Add rule
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <SectionHeading
          title="Tracked movies &times; matched sessions"
          subtitle="Upcoming session times for your watchlist, across the cinemas you're monitoring."
        />

        {matrixRows.length === 0 ? (
          <EmptyState title="Track a movie to see it here." />
        ) : (
          <div className="flex flex-col gap-3">
            {matrixRows.map(({ movie, sessions: movieSessions }) => (
              <div key={movie.id} className="rounded-xl border border-base-700 bg-base-900 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-base-100">{movie.title}</p>
                  <span className="text-xs text-base-500">{movieSessions.length} upcoming session(s)</span>
                </div>
                {movieSessions.length === 0 ? (
                  <p className="text-xs text-base-500">No session times published yet at your cinemas.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {movieSessions.slice(0, 8).map((s) => (
                      <span
                        key={s.id}
                        className="rounded-lg border border-base-800 bg-base-850 px-2.5 py-1 text-xs text-base-300"
                      >
                        <span className="text-base-100">{s.cinemaName}</span> &middot; {formatDateTime(s.startsAt)} &middot; {s.format}
                      </span>
                    ))}
                    {movieSessions.length > 8 && (
                      <span className="px-1 py-1 text-xs text-base-500">+{movieSessions.length - 8} more</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
