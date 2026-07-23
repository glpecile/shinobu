/** Opens `url` in a new tab (KTD-4) — `noopener` so the provider page can't reach back via `window.opener`. */
export async function openExternalUrl(url: string): Promise<void> {
  window.open(url, '_blank', 'noopener');
}
