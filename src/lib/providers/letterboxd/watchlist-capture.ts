/**
 * U6 — the Letterboxd watchlist endpoint capture (plan 0031 R7/R37, KTD-6).
 *
 * A **standing harness**, like `worker/letterboxd-write-spike.ts`: it exists so
 * the watchlist adapter is written against an *observed* request rather than a
 * guessed one. R37 bans guessing here for a specific reason — the site's own
 * control reads "Add to watchlist" / "In watchlist", so the endpoint is plausibly
 * a **toggle**, and an adapter that assumed add-only would remove a film while
 * Shinobu reported success (KTD-6).
 *
 * The capture runs where the session actually lives: inside the authenticated
 * WebView. This module is the pure half — the injected script and the message
 * parser, no RN import — so both are unit-testable. `app/dev/letterboxd-
 * watchlist-spike` is the shell that mounts a *visible* WebView on a film page
 * so you can drive the site's own control by hand, in both directions.
 *
 * **Deliberately not wired to anything in the app.** Its output is a recorded
 * finding in `docs/solutions/letterboxd-watchlist-write.md`, and only that
 * finding may unlock the adapter and the registry flip.
 *
 * ## What must come out of it, before any adapter is written
 *
 * 1. method, path and payload for **add**, and for **remove**;
 * 2. the response shape, and specifically **whether the response says which of
 *    the two happened**. R37's narrow exception (a toggle invoked from
 *    `/watchlist` only) may be taken *only* if it does;
 * 3. the classification: *add-only*, *toggle*, or *add + separate remove*.
 *
 * If it is a toggle with no response discrimination, **both Letterboxd verbs
 * stay `'manual'`** — and the page-1 watchlist cache is not an acceptable
 * mitigation, because a wrong heuristic there *removes* rather than duplicates.
 *
 * Web stays banned regardless: no Worker rule is added
 * (`docs/solutions/letterboxd-web-proxy.md`).
 */

/** One observed request/response pair, already redacted. */
export interface CapturedRequest {
  via: 'fetch' | 'xhr';
  method: string;
  url: string;
  /**
   * Request header names with their values — **except** the credential-bearing
   * ones, which are reduced to a presence marker. The report is meant to be
   * committed, and a captured CSRF token or cookie in a repo is a leak that
   * outlives the spike.
   */
  headers: Record<string, string>;
  body: string | null;
  status: number;
  responseBody: string;
}

/** Header names whose values are never relayed out of the page. */
const REDACTED = new Set(['cookie', 'authorization', 'x-csrf-token', 'set-cookie']);

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = REDACTED.has(name.toLowerCase()) ? '«present, redacted»' : value;
  }
  return out;
}

/**
 * Whether a request is worth relaying. Letterboxd's pages are chatty (analytics,
 * image beacons, ad calls), and a flooded log is one you stop reading — which is
 * how the one request you were waiting for gets missed.
 *
 * Every non-GET is relayed, because a watchlist change is a state change and one
 * of them *is* the answer. GETs are relayed only when the URL mentions the
 * watchlist, which catches the "it's a GET to /s/watch-list/…" shape the legacy
 * site used, without the rest of the page's traffic.
 */
export function shouldCapture(method: string, url: string): boolean {
  if (method.toUpperCase() !== 'GET') return true;
  return /watch-?list/i.test(url);
}

/** The postMessage envelope, so page-native messages are ignored. */
export const CAPTURE_MARKER = 'shinobu-letterboxd-watchlist-capture';

/**
 * Parse one `onMessage` payload. Returns `null` for anything that isn't ours —
 * the page posts its own messages, and so does the diary write bridge.
 */
export function parseCaptureMessage(data: string): CapturedRequest | null {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (message.marker !== CAPTURE_MARKER) return null;
  const via = message.via === 'xhr' ? 'xhr' : 'fetch';
  return {
    via,
    method: typeof message.method === 'string' ? message.method : '',
    url: typeof message.url === 'string' ? message.url : '',
    headers:
      typeof message.headers === 'object' && message.headers != null
        ? redactHeaders(message.headers as Record<string, string>)
        : {},
    body: typeof message.body === 'string' ? message.body : null,
    status: typeof message.status === 'number' ? message.status : 0,
    responseBody: typeof message.responseBody === 'string' ? message.responseBody : '',
  };
}

/**
 * The hook, injected on **every** load — a navigation replaces `window`, so a
 * once-only injection would silently stop capturing the moment you click
 * through to a film page, which is exactly where the control lives.
 *
 * It wraps `fetch` and `XMLHttpRequest` rather than reading the network from
 * outside because the interesting part is the *request the site composes*:
 * headers and payload, not just the URL. Response bodies are read from a
 * `clone()` so the page's own handler still gets its stream — consuming the
 * original would break the very control being driven.
 *
 * Idempotent: re-injecting on a page that already has the hook is a no-op, so a
 * double `onLoadEnd` cannot produce doubled captures.
 */
export function buildCaptureScript(): string {
  return `(function(){
    if (window.__shinobuWatchlistCapture) return 'already-installed';
    window.__shinobuWatchlistCapture = true;
    var MARKER = ${JSON.stringify(CAPTURE_MARKER)};
    function relay(o){
      o.marker = MARKER;
      try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {}
    }
    function wanted(method, url){
      if (String(method || 'GET').toUpperCase() !== 'GET') return true;
      return /watch-?list/i.test(String(url || ''));
    }
    // --- fetch ---
    var nativeFetch = window.fetch;
    window.fetch = function(input, init){
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = (init && init.method) || (input && input.method) || 'GET';
      var headers = {};
      try {
        var h = (init && init.headers) || (input && input.headers);
        if (h) {
          if (typeof h.forEach === 'function') h.forEach(function(v, k){ headers[k] = v; });
          else Object.keys(h).forEach(function(k){ headers[k] = h[k]; });
        }
      } catch (e) {}
      var body = null;
      try { if (init && typeof init.body === 'string') body = init.body; } catch (e) {}
      var promise = nativeFetch.apply(this, arguments);
      if (!wanted(method, url)) return promise;
      return promise.then(function(response){
        try {
          response.clone().text().then(function(text){
            relay({ via: 'fetch', method: method, url: url, headers: headers,
                    body: body, status: response.status, responseBody: text.slice(0, 4000) });
          });
        } catch (e) {
          relay({ via: 'fetch', method: method, url: url, headers: headers,
                  body: body, status: response.status, responseBody: '«unreadable»' });
        }
        return response;
      });
    };
    // --- XMLHttpRequest ---
    var open = XMLHttpRequest.prototype.open;
    var send = XMLHttpRequest.prototype.send;
    var setHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function(method, url){
      this.__shinobu = { method: method, url: url, headers: {} };
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(name, value){
      if (this.__shinobu) this.__shinobu.headers[name] = value;
      return setHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(body){
      var meta = this.__shinobu;
      if (meta && wanted(meta.method, meta.url)) {
        this.addEventListener('loadend', function(){
          relay({ via: 'xhr', method: meta.method, url: meta.url, headers: meta.headers,
                  body: typeof body === 'string' ? body : null,
                  status: this.status, responseBody: String(this.responseText || '').slice(0, 4000) });
        });
      }
      return send.apply(this, arguments);
    };
    return 'installed';
  })();`;
}

/**
 * The captures as the markdown that lands in
 * `docs/solutions/letterboxd-watchlist-write.md`. Built here rather than in the
 * screen so the deliverable is the same whether you copy it off the device or
 * read it off a log.
 */
export function captureReport(captures: readonly CapturedRequest[]): string {
  const lines = [
    '# Letterboxd: the watchlist endpoint, as observed',
    '',
    'Captured by `app/dev/letterboxd-watchlist-spike` (plan 0031 U6) inside the',
    'authenticated WebView, by driving the site\'s own watchlist control.',
    'Credential headers are redacted at capture time.',
    '',
    `${captures.length} request(s) captured.`,
    '',
  ];
  captures.forEach((capture, index) => {
    lines.push(
      `## ${index + 1}. \`${capture.method} ${capture.url}\` → ${capture.status} (${capture.via})`,
      '',
      '```json',
      JSON.stringify(
        { headers: capture.headers, body: capture.body, response: capture.responseBody },
        null,
        2,
      ),
      '```',
      '',
    );
  });
  lines.push(
    '## Classification',
    '',
    '<!-- REQUIRED before any adapter is written (R37/KTD-6):',
    '     - add-only | toggle | add + separate remove',
    '     - does the RESPONSE say which of the two happened? If not, a toggle',
    '       keeps BOTH Letterboxd verbs at `\'manual\'` — the page-1 watchlist',
    '       cache is not an acceptable mitigation, because a wrong heuristic',
    '       there removes a film rather than duplicating one. -->',
    '',
  );
  return lines.join('\n');
}
