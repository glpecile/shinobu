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
 * "shinobu, , horror". The trailing separator is preserved only when the value
 * already had one, which is both the prefill's cursor-ready convention and
 * what makes add-then-remove restore the original string exactly.
 */
export function toggleTag(input: string, tag: string): string {
  const tags = parseTags(input);
  const needle = tag.toLowerCase();
  const without = tags.filter((existing) => existing.toLowerCase() !== needle);
  const next = without.length === tags.length ? [...tags, tag] : without;

  if (next.length === 0) return '';
  const joined = next.join(', ');
  return /,\s*$/.test(input) ? `${joined}, ` : joined;
}
