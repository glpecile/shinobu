/**
 * Comma-separated diary-tags input → trimmed, non-empty tag list. The sheet
 * prefills the field with a trailing separator ("shinobu, ") so the cursor
 * is ready for the next tag — the empty segment that leaves behind must
 * never reach a provider.
 */
export function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

/**
 * Whether the field already carries this tag. Case-insensitive: a typed
 * "horror" and the suggested "Horror" chip are the same tag to Letterboxd and
 * Serializd, so the chip must read as selected rather than offering a
 * duplicate.
 */
export function hasTag(input: string, tag: string): boolean {
  const needle = tag.toLowerCase();
  return parseTags(input).some((existing) => existing.toLowerCase() === needle);
}

/**
 * Add or remove one tag in the raw field value (the tag-picker chips).
 *
 * The result is re-serialized from `parseTags` rather than concatenated onto
 * the raw string — naive appending turns the prefilled "shinobu, " into
 * "shinobu, , horror".
 *
 * A non-empty result *always* ends in a separator. That is what makes the
 * picker's filter reset when you tap a chip: the filter is derived from
 * `activeTagFragment`, so leaving a trailing comma empties the fragment and
 * brings every suggestion back, cursor ready for the next tag. It also keeps
 * the prefill's own convention ("shinobu, "), so add-then-remove restores that
 * string exactly.
 */
export function toggleTag(input: string, tag: string): string {
  const tags = parseTags(input);
  const needle = tag.toLowerCase();
  const without = tags.filter((existing) => existing.toLowerCase() !== needle);
  const next = without.length === tags.length ? [...tags, tag] : without;

  if (next.length === 0) return '';
  return `${next.join(', ')}, `;
}

/**
 * The segment after the last comma — the tag the user is part-way through
 * typing, which is what the picker filters its suggestions by.
 *
 * Deriving this from the text instead of holding a separate filter state is
 * what makes "reset when I type a comma" free: completing a tag leaves an
 * empty trailing segment, so the filter clears itself with no event to wire
 * up. Same for tapping a chip, since `toggleTag` always leaves a separator.
 */
export function activeTagFragment(input: string): string {
  return input.slice(input.lastIndexOf(',') + 1).trim();
}

/**
 * Suggestions matching what's being typed, prefix matches first — typing "p"
 * should reach "p" and "palermo" before "cinepolis-recoleta", which merely
 * contains one. Order is otherwise preserved, so the underlying
 * frequency/recency ranking survives filtering. An empty fragment means "not
 * filtering", not "match nothing".
 */
export function filterTagSuggestions(
  suggestions: readonly string[],
  fragment: string,
): string[] {
  // Trimmed here as well as in `activeTagFragment` so the function is total on
  // its own input — a whitespace-only fragment is "not filtering", never
  // "match nothing".
  const needle = fragment.trim().toLowerCase();
  if (needle === '') return [...suggestions];

  const prefix: string[] = [];
  const contains: string[] = [];
  for (const tag of suggestions) {
    const haystack = tag.toLowerCase();
    if (haystack.startsWith(needle)) prefix.push(tag);
    else if (haystack.includes(needle)) contains.push(tag);
  }
  return [...prefix, ...contains];
}
