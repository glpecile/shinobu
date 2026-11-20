/** "Ana de Armas" → "AD" — the headshot fallback monogram. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    // Array.from splits by code point, so an emoji stays whole.
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
}
