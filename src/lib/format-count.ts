/**
 * A count shown the way YouTube shows views: the significant prefix of the
 * number with K/M/B. 1_286 → "1.3K", 1_200_000 → "1.2M". Values under 1,000
 * pass through unchanged. At most one decimal, and only when it earns its
 * place ("1K", never "1.0K"), so a 34-item list and a 12431-item list keep the
 * same row height on lists cards.
 */
export function formatCount(count: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 1, notation: 'compact' }).format(count);
}