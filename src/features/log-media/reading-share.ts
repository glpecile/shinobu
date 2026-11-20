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

/**
 * One step from `page`, in the field's unit: a page, or a percent. A percent
 * step always moves at least one page, so it never lands where it started on
 * a book under 100 pages.
 */
export function stepPage(page: number, total: number, by: 1 | -1, inPages: boolean): number {
  const at = inPages ? page + by : pageAt(percentRead(page, total) + by, total);
  const next = by > 0 ? Math.max(page + 1, at) : Math.min(page - 1, at);
  return Math.min(total, Math.max(0, next));
}
