import { openExternalUrl } from '@/lib/open-external-url';

/** Opens the userscript installer served by the current Shinobu deployment. */
export function installLetterboxdScript(): void {
  void openExternalUrl(new URL('/letterboxd.user.js', window.location.origin).href);
}

/** What a Letterboxd write surface says while the userscript can't serve `task` on this tab. */
export function letterboxdScriptHint(untrusted: boolean, task: string): string {
  return untrusted
    ? `This dev server isn't trusted by the Letterboxd script. In Tampermonkey's Settings, set Config mode to Advanced. Then set shinobu-trust-localhost to true in the script's Storage tab and reload this tab to ${task}.`
    : `Install or update the Letterboxd script, then reload this tab to ${task}.`;
}
