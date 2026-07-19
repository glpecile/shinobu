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
