/**
 * Real cinema sites identify movies by their own title strings (or their
 * own internal ids, which we don't have a mapping for), not by our
 * `Movie.id`. So every real scraper has to line up "the movie we're
 * watching for" against "what this cinema calls it" — this is that lookup,
 * shared by every provider scraper.
 *
 * Deliberately forgiving (case/punctuation/whitespace-insensitive, and
 * tolerant of a trailing subtitle after a colon) rather than exact, since
 * cinemas format titles slightly differently from each other and from
 * whatever feeds `Movie.title` (today the invented seed catalogue; later
 * TMDB).
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "Practical Magic 2" -> "practical-magic-2" — a best-effort guess at how
 * a title-slug-based lookup (e.g. Dendy's `findMovieBySlug`) names a movie.
 * Cinemas that need this should treat a miss as "not showing here" rather
 * than an error — the guess won't always match their exact slug. */
export function slugifyTitle(title: string): string {
  return normalizeTitle(title).trim().replace(/\s+/g, "-");
}

export function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Tolerate "Title: Subtitle" vs "Title" (either direction) — but only
  // when the *original* strings actually have a colon at that boundary,
  // not merely "one title happens to start with the other's words" (e.g.
  // "Tony" must not match "Tony Stark").
  const ta = a.trim().toLowerCase();
  const tb = b.trim().toLowerCase();
  return ta.startsWith(tb + ":") || tb.startsWith(ta + ":");
}
