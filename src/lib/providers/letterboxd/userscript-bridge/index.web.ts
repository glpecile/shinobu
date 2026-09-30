import { useSyncExternalStore } from 'react';
import type { LetterboxdWatchlistWebFetch, LetterboxdWatchlistWebRequest, LetterboxdWebFetch, LetterboxdWebRequest, LetterboxdWebResponse } from '@/lib/providers/letterboxd/deps';

const READY_ATTRIBUTE = 'data-shinobu-letterboxd-bridge';

export function hasLetterboxdUserscript(capability: 'log' | 'watchlist' | 'watchlist-remove' = 'log'): boolean {
  const version = typeof document !== 'undefined' ? document.documentElement.getAttribute(READY_ATTRIBUTE) : null;
  return version === '5' || (capability !== 'watchlist-remove' && version === '4') || (capability === 'log' && version === '3');
}

function subscribe(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [READY_ATTRIBUTE] });
  return () => observer.disconnect();
}

function serverSnapshot() { return false; }

export function useLetterboxdUserscript(capability: 'log' | 'watchlist' | 'watchlist-remove' = 'log'): boolean {
  return useSyncExternalStore(subscribe, () => hasLetterboxdUserscript(capability), serverSnapshot);
}

/** The userscript owns the cross-tab handoff. Cookies never enter Shinobu. */
export function getLetterboxdUserscriptFetch(username: string | null): LetterboxdWebFetch | undefined {
  if (!username || !hasLetterboxdUserscript()) return undefined;
  return (request) => sendRequest(username, 'log', request);
}

export function getLetterboxdUserscriptWatchlistFetch(username: string | null): LetterboxdWatchlistWebFetch | undefined {
  if (!username || !hasLetterboxdUserscript('watchlist')) return undefined;
  return (request) => {
    if (!request.inWatchlist && !hasLetterboxdUserscript('watchlist-remove')) {
      return Promise.reject(new Error('Update the Letterboxd script to support watchlist removals. Nothing was sent.'));
    }
    return sendRequest(username, 'watchlist', request);
  };
}

function sendRequest(username: string, capability: 'log' | 'watchlist', request: LetterboxdWebRequest | LetterboxdWatchlistWebRequest): Promise<LetterboxdWebResponse> {
  return new Promise((resolve, reject) => {
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
      reject(new Error('Letterboxd userscript timed out. Check Letterboxd before retrying; the write may have succeeded.'));
    }, 60_000);
    window.addEventListener('message', receive);
    window.postMessage({ type: `shinobu-letterboxd-${capability}`, id, request: { ...request, username } }, location.origin);
  });
}
