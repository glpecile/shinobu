import { useSyncExternalStore } from 'react';
import type { LetterboxdWebFetch, LetterboxdWebResponse } from '@/lib/providers/letterboxd/deps';

const READY_ATTRIBUTE = 'data-shinobu-letterboxd-bridge';

export function hasLetterboxdUserscript(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute(READY_ATTRIBUTE) === '3';
}

function subscribe(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [READY_ATTRIBUTE] });
  return () => observer.disconnect();
}

function serverSnapshot() { return false; }

export function useLetterboxdUserscript(): boolean {
  return useSyncExternalStore(subscribe, hasLetterboxdUserscript, serverSnapshot);
}

/** The userscript owns the cross-tab handoff. Cookies never enter Shinobu. */
export function getLetterboxdUserscriptFetch(username: string | null): LetterboxdWebFetch | undefined {
  if (!username || !hasLetterboxdUserscript()) return undefined;
  return (request) => new Promise<LetterboxdWebResponse>((resolve, reject) => {
    const id = crypto.randomUUID();
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', receive);
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin ||
          event.data?.type !== 'shinobu-letterboxd-result' || event.data.id !== id) return;
      const result = event.data.response;
      if (!result || !Number.isInteger(result.status) || result.status < 0 || result.status > 599 ||
          typeof result.body !== 'string' || result.body.length > 8192) return;
      cleanup();
      resolve(result);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Letterboxd userscript timed out. Check Letterboxd before retrying; the log may have succeeded.'));
    }, 60_000);
    window.addEventListener('message', receive);
    window.postMessage({ type: 'shinobu-letterboxd-log', id, request: { ...request, username } }, location.origin);
  });
}
