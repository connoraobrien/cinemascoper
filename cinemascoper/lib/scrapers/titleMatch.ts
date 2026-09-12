// Named HTML entities that actually show up in real title text — not an
// exhaustive HTML5 entity table (this app has no general-purpose HTML
// parser and doesn't need one), just the handful that appear in movie
// titles: possessives/contractions ("Don't", "Ocean's Eleven"), ampersands
// ("Ferris Bueller's Day Off" doesn't have one, but plenty of titles do),
// and quoted subtitles.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lsquo: "'",
  rsquo: "'",
  lsquor: "'",
  sbquo: "'",
  ldquo: '"',
  rdquo: '"',
  bdquo: '"',
  ndash: "-",
  mdash: "-",
  hellip: "...",
  nbsp: " ",
};

/**
 * Decodes HTML entities in text pulled straight out of raw HTML by regex
 * (Ritz's `data-name="…"`, Golden Age's `aria-label="…"`, flicks.com.au's
 * `<h3 class="…movie-title">…</h3>` text) rather than through a real HTML
 * parser — regex extraction never decodes entities, so any cinema site
 * that spells an apostrophe/quote/dash as an entity (e.g. "Don&#8217;t
 * Look Back in Anger", or "Don&#39;t...") would otherwise show up on
 * CinemaScoper with that literal entity text still in it, which reads as
 * garbled/stray punctuation rather than the apostrophe it's meant to be.
 * Also folds "smart" typographic quotes/dashes that decode to non-ASCII
 * characters down to their plain ASCII equivalents, purely for consistent
 * display and reliable title matching (`normalizeTitle` below already
 * treats punctuation loosely, but this keeps the *displayed* title clean
 * too, not just the matching).
 */
export function decodeHtmlText(text: string): string {
  return text
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, body: string) => {
      if (body[0] === "#") {
        const codePoint = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
    })
    .replace(/[‘’‚‛]/g, "'") // smart single quotes -> '
    .replace(/[“”„‟]/g, '"') // smart double quotes -> "
    .replace(/[–—]/g, "-") // en/em dash -> -
    .replace(/\s+/g, " ")
    .trim();
}

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
