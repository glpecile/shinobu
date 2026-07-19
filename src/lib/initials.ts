/** "Ana de Armas" → "AD" — the headshot fallback monogram. */
export function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}
