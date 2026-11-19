# Web tabs that outlive a deploy fail to load route chunks

Seen on Firefox for Android, mostly after a refresh of a tab that had been open
for days. The root error boundary showed "Loading module
https://shinobu.glpecile.xyz/_expo/static/js/web/index-<hash>.js failed."

Expo Router splits each web route into its own chunk with a content hash in
the file name. A deploy replaces every file in `dist`, so the chunks of the
previous build no longer exist. A tab still running the previous bundle asks
for the old hash, and the Worker answers with `404.html` (`text/html`, status
404; probed 2026-11-19). Expo's loader (`expo/src/async-require/fetchThenEval.web.ts`)
then throws an `AsyncRequireError`. "Try again" asks for the same missing file,
so it fails again.

The HTML itself is served with `cache-control: public, max-age=0,
must-revalidate`, so a real reload gets the current build.

## Fix

`reloadOnStaleBundle` (`src/lib/stale-bundle.ts`) is the root
`ErrorBoundary`'s `onError`. On an `AsyncRequireError` it reloads the page
once. A second failure within 10 seconds is a broken deploy, not a stale tab,
so the fallback shows and its button reloads instead of resetting the boundary.
