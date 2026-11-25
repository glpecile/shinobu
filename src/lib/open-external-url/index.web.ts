export async function openExternalUrl(url: string, _options?: { inApp?: boolean }): Promise<void> {
  window.open(url, '_blank', 'noopener');
}
