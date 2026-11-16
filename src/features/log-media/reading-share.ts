/** The share of the book read: 0 only before page 1, 100 only on the last page. */
export function percentRead(page: number, total: number): number {
  if (page <= 0) return 0;
  if (page >= total) return 100;
  return Math.min(99, Math.max(1, Math.round((page / total) * 100)));
}

/**
 * The page a share of the book lands on, the inverse of `percentRead`: only 0%
 * starts the read and only 100% finishes it, however short the book.
 */
export function pageAt(percent: number, total: number): number {
  if (percent <= 0) return 0;
  if (percent >= 100) return total;
  return Math.min(total - 1, Math.max(1, Math.round((percent / 100) * total)));
}
