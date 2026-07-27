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
 * The tags the user has actually committed — everything before the last
 * separator. The tail is excluded because it is still being typed.
 *
 * This is deliberately narrower than `parseTags`, which is the submit path and
 * must take the tail too (a value typed without a trailing comma still means
 * every tag in it). The picker is the one place that needs the distinction:
 * to it, the tail is a filter query, not a tag.
 */
export function committedTags(input: string): string[] {
  return parseTags(input.slice(0, input.lastIndexOf(',') + 1));
}

/**
 * Whether a chip should render as selected. Case-insensitive: a typed "horror"
 * and the suggested "Horror" chip are the same tag to Letterboxd and Serializd,
 * so the chip must read as selected rather than offering a duplicate.
 *
 * Committed tags only. While "netflix" is still being typed it is a query, not
 * a selection — showing its own chip as already-selected would make the tap
 * that commits it look like a no-op.
 */
export function isTagSelected(input: string, tag: string): boolean {
  const needle = tag.toLowerCase();
  return committedTags(input).some(
    (existing) => existing.toLowerCase() === needle,
  );
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
  // Committed tags only, so the half-typed tail is *replaced* rather than left
  // behind: typing "net" and pressing the netflix chip means "I meant netflix",
  // not "add netflix alongside a tag literally called net". Dropping it applies
  // to removal too — the tail is a filter query either way, and the chips the
  // user can even see are the ones that query matched.
  const tags = committedTags(input);
  const needle = tag.toLowerCase();
  const without = tags.filter((existing) => existing.toLowerCase() !== needle);
  const next = without.length === tags.length ? [...tags, tag] : without;

  if (next.length === 0) return '';
  return `${next.join(', ')}, `;
}

/**
 * The suggestion pool with the tags committed in `input` pinned to the front,
 * in the order that field lists them.
 *
 * The picker collapses to a single row, so position is visibility: a pool that
 * arrives from Letterboxd mid-sheet (the query resolves a beat after the sheet
 * opens) used to push the prefilled tag off the visible row, and the one tag
 * the user could see was selected vanished as the suggestions loaded. Pinning
 * makes the selection the part of the list that can't be displaced.
 *
 * The caller passes the field as it stood when the picker mounted, not the
 * live value — see `TagPicker`'s `openedWith`.
 *
 * A committed tag the pool has never seen is pinned too, not dropped — the user
 * typed it, so it earns a chip, and that chip is the only way to remove it
 * without editing the text. Where both know a tag, the pool's casing wins:
 * "Horror" is Letterboxd's own spelling of the tag a user typed as "horror",
 * and the chip should read the way the provider stores it.
 */
export function pinSelectedTags(
  suggestions: readonly string[],
  input: string,
): string[] {
  const canonical = new Map<string, string>();
  for (const tag of suggestions) {
    const key = tag.toLowerCase();
    if (!canonical.has(key)) canonical.set(key, tag);
  }

  const pinned = new Set<string>();
  const ordered: string[] = [];
  for (const tag of committedTags(input)) {
    const key = tag.toLowerCase();
    if (pinned.has(key)) continue;
    pinned.add(key);
    ordered.push(canonical.get(key) ?? tag);
  }
  for (const tag of suggestions) {
    if (!pinned.has(tag.toLowerCase())) ordered.push(tag);
  }

  return ordered;
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
