export function formatCount(count: number): string {
  for (const [suffix, size] of UNITS) {
    if (count >= size) return `${Math.round((count / size) * 10) / 10}${suffix}`;
  }
  return String(count);
}

// By hand: Hermes on iOS ignores `Intl.NumberFormat`'s `notation: 'compact'`
// and prints the whole number with grouping ("40,552").
const UNITS = [
  ['B', 1e9],
  ['M', 1e6],
  ['K', 1e3],
] as const;
