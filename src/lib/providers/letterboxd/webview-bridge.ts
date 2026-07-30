import type {
  LetterboxdWatchlistWebRequest,
  LetterboxdWebRequest,
  LetterboxdWebResponse,
} from './deps';

/**
 * Bridges Letterboxd writes into the hidden authenticated login WebView
 * (`components/letterboxd-write-bridge`, native only). Replaying the captured
 * cookies over nitro-fetch lands as signed-out at Letterboxd's origin, so the
 * write must run in-session — the only channel carrying the real session is the
 * WebView itself (proven empirically, docs/solutions/letterboxd-no-api-fallback.md).
 *
 * `evaluateJavaScript` resolves with `String(describing:)` of the *expression*,
 * NOT the eventual value of a promise (nitro-webview spec), so a `fetch` result
 * can't come back through its return value. Instead the injected script relays
 * the outcome over `window.ReactNativeWebView.postMessage(...)` → the WebView's
 * `onMessage` event → `handleLetterboxdMessage` here, matched by a request id.
 *
 * This module holds only plain Promises — Effect stays contained in writes.ts,
 * which wraps `letterboxdWebFetch` in `Effect.tryPromise` (AGENTS.md boundary).
 */

/** The subset of the WebView ref this bridge drives. */
export interface LetterboxdWebViewHandle {
  evaluateJavaScript(code: string): Promise<string>;
}

interface Pending {
  resolve: (response: LetterboxdWebResponse) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

const WRITE_TIMEOUT_MS = 20_000;

let webView: LetterboxdWebViewHandle | null = null;
let loaded = false;
let counter = 0;
const pending = new Map<string, Pending>();
const loadWaiters = new Set<() => void>();

/** Called by the bridge component's `hybridRef`; `null` on unmount. */
export function registerLetterboxdWebView(ref: LetterboxdWebViewHandle | null): void {
  webView = ref;
  if (ref == null) {
    loaded = false;
    // Fail any in-flight writes rather than let them hang to timeout.
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new Error('Letterboxd WebView unmounted'));
      pending.delete(id);
    }
  }
}

/** Wired to `onLoadEnd`/`onLoadStart` — writes wait for a loaded page. */
export function setLetterboxdWebViewLoaded(value: boolean): void {
  loaded = value;
  if (value) {
    for (const waiter of loadWaiters) waiter();
    loadWaiters.clear();
  }
}

/** Wired to `onMessage`; resolves the matching pending write. Ignores any
 * message that isn't one of ours (the page posts its own messages too). */
export function handleLetterboxdMessage(data: string): void {
  let message: { id?: unknown; status?: unknown; body?: unknown };
  try {
    message = JSON.parse(data) as typeof message;
  } catch {
    return;
  }
  if (typeof message.id !== 'string') return;
  const entry = pending.get(message.id);
  if (entry == null) return;
  pending.delete(message.id);
  clearTimeout(entry.timer);
  const status = typeof message.status === 'number' ? message.status : 0;
  const body = typeof message.body === 'string' ? message.body : '';
  entry.resolve({ status, body });
}

function waitForLoaded(signal: { cancelled: boolean }): Promise<void> {
  if (loaded) return Promise.resolve();
  return new Promise((resolve) => {
    const waiter = () => {
      if (!signal.cancelled) resolve();
    };
    loadWaiters.add(waiter);
  });
}

/** Navigate the WebView to `path` (relative to the letterboxd.com origin it is
 * already on). `String()` return keeps `evaluateJavaScript`'s promise happy. */
function buildNavigateScript(path: string): string {
  return `(function(){ window.location.assign(${JSON.stringify(path)}); return 'nav'; })();`;
}

/**
 * The submit script — runs on the freshly-rendered film page. It POSTs the diary
 * entry to Letterboxd's modern same-origin JSON API,
 * `POST /api/v0/production-log-entries`, exactly as the site's own JS does
 * (`_composeCreateLogEntryRequest` → `_doSubmission`). The legacy
 * `<form.js-diary-entry-form action="/s/save-diary-entry">` is a dead endpoint
 * that 404s — the site overrides its submit and never posts to it
 * (docs/solutions/letterboxd-no-api-fallback.md).
 *
 * Two page-derived values ride along:
 *  - `productionId` — the film's **LID**, read from the `production:identifier`
 *    meta (`{"lid":"UH8e",…}`); falls back to the LID resolved by writes.ts.
 *  - `X-CSRF-TOKEN` header — **`window.supermodelCSRF`** (the API takes the token
 *    in a header, not the body). Falls back to the `com.xk72.webparts.csrf`
 *    cookie only if the global is absent.
 *
 * The outcome (plus a `debug` breadcrumb) is relayed over postMessage.
 */
function buildSubmitScript(id: string, request: LetterboxdWebRequest): string {
  const body = {
    diaryDetails: { diaryDate: request.viewingDateStr, rewatch: request.rewatch },
    tags: request.tags,
    like: false,
  };
  return `(function(){
    var id = ${JSON.stringify(id)};
    function post(o){ o.id = id; try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} }
    try {
      // The film LID (productionId) the API keys on — read from the page's own meta.
      var lid = '';
      var meta = document.querySelector('meta[name="production:identifier"]');
      if (meta) { try { lid = (JSON.parse(meta.getAttribute('content') || '{}') || {}).lid || ''; } catch (e) {} }
      if (!lid) lid = ${JSON.stringify(request.filmLid)};
      if (!lid) { post({ status: 0, body: 'no-production-lid' }); return; }
      // The token the site itself submits — falls back to the cookie only if absent.
      var csrf = window.supermodelCSRF;
      if (!csrf) { var m = document.cookie.match(/com\\.xk72\\.webparts\\.csrf=([^;]+)/); csrf = m ? m[1] : ''; }
      var payload = Object.assign({ productionId: lid }, ${JSON.stringify(body)});
      fetch((window.baseURL || '') + '/api/v0/production-log-entries', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify(payload)
      }).then(function(r){
        return r.text().then(function(t){ post({ status: r.status, body: t }); });
      }).catch(function(e){ post({ status: 0, body: 'fetch-error: ' + String(e) }); });
    } catch (e) { post({ status: 0, body: 'script-error: ' + String(e) }); }
  })();`;
}

/**
 * The watchlist script — runs on the freshly-rendered film page and replays the
 * captured flow verbatim (plan 0033 R3/KTD-3,
 * docs/solutions/letterboxd-watchlist-write.md): a fresh CSRF token from
 * `POST /ajax/letterboxd-metadata/` (what the site's own control does — not the
 * diary write's `window.supermodelCSRF` page-global), sent as `x-csrf-token` on
 * `PATCH /api/v0/me/watchlist/{lid}` with the target state in the body. The
 * film's LID is read off the page's `production:identifier` meta, falling back
 * to the LID resolved by the adapter. Outcome relayed over postMessage.
 */
function buildWatchlistScript(
  id: string,
  request: LetterboxdWatchlistWebRequest,
): string {
  return `(function(){
    var id = ${JSON.stringify(id)};
    function post(o){ o.id = id; try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} }
    try {
      var lid = '';
      var meta = document.querySelector('meta[name="production:identifier"]');
      if (meta) { try { lid = (JSON.parse(meta.getAttribute('content') || '{}') || {}).lid || ''; } catch (e) {} }
      if (!lid) lid = ${JSON.stringify(request.filmLid)};
      if (!lid) { post({ status: 0, body: 'no-production-lid' }); return; }
      fetch((window.baseURL || '') + '/ajax/letterboxd-metadata/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: ''
      }).then(function(r){ return r.json(); }).then(function(metadata){
        var csrf = (metadata && metadata.csrf) || '';
        if (!csrf) { post({ status: 0, body: 'no-csrf' }); return; }
        return fetch((window.baseURL || '') + '/api/v0/me/watchlist/' + lid, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json; charset=UTF-8', 'x-csrf-token': csrf },
          body: JSON.stringify({ inWatchlist: ${JSON.stringify(request.inWatchlist)} })
        }).then(function(r){
          return r.text().then(function(t){ post({ status: r.status, body: t }); });
        });
      }).catch(function(e){ post({ status: 0, body: 'fetch-error: ' + String(e) }); });
    } catch (e) { post({ status: 0, body: 'script-error: ' + String(e) }); }
  })();`;
}

/**
 * The navigate→wait→inject runner both write transports share (plan 0033
 * KTD-4): render `filmPath` so the page-derived values (LID meta, live session)
 * are in place, then inject the verb's own script, whose outcome arrives via
 * postMessage → `handleLetterboxdMessage`. Rejects if no WebView is mounted
 * (web / not connected) so the adapter surfaces a dead-session error rather
 * than hanging.
 */
function runInFilmPage(
  filmPath: string,
  buildScript: (id: string) => string,
): Promise<LetterboxdWebResponse> {
  const ref = webView;
  if (ref == null) {
    return Promise.reject(new Error('Letterboxd WebView is not mounted'));
  }
  const id = `lb-${(counter += 1)}-${Date.now()}`;
  const signal = { cancelled: false };
  return new Promise<LetterboxdWebResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.cancelled = true;
      pending.delete(id);
      reject(new Error('Letterboxd WebView write timed out'));
    }, WRITE_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });

    const fail = (error: unknown) => {
      const entry = pending.get(id);
      if (entry == null) return;
      pending.delete(id);
      clearTimeout(entry.timer);
      reject(error);
    };

    void (async () => {
      // Render the film page so the page-derived values are in-session.
      loaded = false;
      await ref.evaluateJavaScript(buildNavigateScript(filmPath));
      await waitForLoaded(signal);
      if (signal.cancelled) return;
      const current = webView;
      if (current == null) return; // registerLetterboxdWebView already rejected it
      await current.evaluateJavaScript(buildScript(id));
      // Result arrives via postMessage → handleLetterboxdMessage.
    })().catch(fail);
  });
}

/**
 * Run a diary write inside the authenticated WebView: navigate to the film page
 * (so the live CSRF token and the film-LID meta are in the session), wait for it
 * to load, then POST the diary entry to the JSON API.
 */
export function letterboxdWebFetch(
  request: LetterboxdWebRequest,
): Promise<LetterboxdWebResponse> {
  return runInFilmPage(request.filmPath, (id) => buildSubmitScript(id, request));
}

/**
 * Run a watchlist state set inside the authenticated WebView (plan 0033 R3):
 * same runner as the diary write, this verb's script.
 */
export function letterboxdWatchlistWebFetch(
  request: LetterboxdWatchlistWebRequest,
): Promise<LetterboxdWebResponse> {
  return runInFilmPage(request.filmPath, (id) => buildWatchlistScript(id, request));
}

/** The transport for `letterboxdDeps`, or `undefined` when no WebView is
 * mounted (web / disconnected) so writes fail cleanly as read-only. */
export function getLetterboxdWebFetch(): typeof letterboxdWebFetch | undefined {
  return webView != null ? letterboxdWebFetch : undefined;
}

/** The watchlist transport, under the same availability rule as `getLetterboxdWebFetch`. */
export function getLetterboxdWatchlistWebFetch():
  | typeof letterboxdWatchlistWebFetch
  | undefined {
  return webView != null ? letterboxdWatchlistWebFetch : undefined;
}

/** Test seam: reset the module singleton between cases. */
export function resetLetterboxdWebViewBridge(): void {
  webView = null;
  loaded = false;
  counter = 0;
  for (const p of pending.values()) clearTimeout(p.timer);
  pending.clear();
  loadWaiters.clear();
}
