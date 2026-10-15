/** Resolve only absolute HTTP(S) destinations from untrusted Markdown. */
export function httpUrl(target: string): string | undefined {
  try {
    const url = new URL(target);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch {
    return undefined;
  }
}
