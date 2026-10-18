import { openExternalUrl } from '@/lib/open-external-url';

/** Opens the userscript installer served by the current Shinobu deployment. */
export function installLetterboxdScript(): void {
  void openExternalUrl(new URL('/letterboxd.user.js', window.location.origin).href);
}
