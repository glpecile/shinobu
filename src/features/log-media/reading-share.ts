export function percentRead(page: number, total: number): number {
  if (page <= 0) return 0;
  if (page >= total) return 100;
  return Math.min(99, Math.max(1, Math.round((page / total) * 100)));
}

export function pageAt(percent: number, total: number): number {
  if (percent <= 0) return 0;
  if (percent >= 100) return total;
  return Math.min(total - 1, Math.max(1, Math.round((percent / 100) * total)));
}

export function stepPage(page: number, total: number, by: number, inPages: boolean): number {
  const at = inPages ? page + by : pageAt(percentRead(page, total) + by, total);
  const next = by > 0 ? Math.max(page + 1, at) : Math.min(page - 1, at);
  return Math.min(total, Math.max(0, next));
}
