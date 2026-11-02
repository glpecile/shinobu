# Native Letterboxd writes waited for the whole film page

Reported on 0.8.2, 2026-11-02: on a slow connection, a Letterboxd log or
watchlist change took 30 s or more and then failed, and a retry succeeded.

## Cause

The write bridge passed its script as `injectedJavaScript`. In
`nitro-webview`, iOS installs that as an `.atDocumentEnd` user script, which
runs at DOMContentLoaded. Android evaluates it in `onPageFinished`, which
waits for the page's `load` event: every image, ad, and third-party script.
A film page is about 340 requests and 1.4 MB. Since #336, each write mounts its
own page, so a log and its watchlist removal load two pages over the same
link. The retry succeeded because the first attempt had filled the WebView
cache.

Chrome, same film page, 3G-like link (400 ms, 50 KB/s), until the write's
response:

| write starts at | time |
|---|---|
| `load` (old Android) | 40.8 s |
| DOMContentLoaded (old iOS) | 24.9 s |
| `<head>` parsed | 10.7 s |
| `<head>` parsed, then `window.stop()` | 7.0 s |

## Fix

`runInPage` installs its script with `injectedJavaScriptBeforeContentLoaded`,
which is document start on both platforms. The script starts the write at
DOMContentLoaded. Film writes also start as soon as the
`production:identifier` meta exists: it closes `<head>`, after the inline
script that sets `supermodelCSRF`. They then call `window.stop()` so the
rest of the page doesn't compete with the write. The `sessionStorage` key
still makes the write run once per request, even when both triggers fire or
the page reloads.

On a Pixel 8 Pro (Android 17, WebView 158), CDP on the hidden WebView showed
the old watchlist write start at `load`, after 228 requests. The new one
started before DOMContentLoaded, got a 200, and the page closed 1.45 s after
the debugger attached.
