/**
 * A count shown the way YouTube shows views: the significant prefix of the
 * number with K/M/B. 1_286 → "1.3K", 1_200_000 → "1.2M". Values under 1,000
 * pass through unchanged. At most one decimal, and only when it earns its
 * place ("1K", never "1.0K"), so a 34-item list and a 12431-item list keep the
 * same row height on lists cards.
 */
export function formatCount(count: number): string {
  for (const [suffix, size] of UNITS) {
    const value = Math.round((count / size) * 10) / 10;
    if (value >= 1 && count >= 1000) return `${value}${suffix}`;
  }
  return String(count);
}

// By hand: Hermes on iOS ignores `Intl.NumberFormat`'s `notation: 'compact'`
// and prints the whole number with grouping ("40,552").
const UNITS = [['B', 1e9], ['M', 1e6], ['K', 1e3]] as const;