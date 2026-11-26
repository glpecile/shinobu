export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      // Array.from splits by code point, so a one-code-point emoji stays whole (a ZWJ sequence or flag does not).
      .map((word) => Array.from(word)[0] ?? '')
      .join('')
      .toUpperCase()
  );
}
