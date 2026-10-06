# iOS WebView JavaScript evaluation must run on the main thread

## Crash

Opening Letterboxd sign-in crashed Shinobu on the iOS 26.5 simulator.
The 2026-09-29 crash report shows
`WebKit::crashDueToApplicationCallingMainThreadOnlyWebKitAPIFromBackgroundThread`
on `com.facebook.react.runtime.JavaScript`, through
`HybridNitroWebView.evaluateJavaScript(code:)`.

`nitro-webview@0.1.0` calls `WKWebView.evaluateJavaScript` directly from its
imperative Nitro method. Nitro invokes that method on React Native's JS thread.
Letterboxd sign-in calls it to capture `navigator.userAgent` after reading
cookies. Serializd does not capture the user agent, so opening its sign-in
does not hit this crash. JavaScript `try/catch` cannot catch WebKit's native trap.

## Sign-in fix

On iOS, `ProviderSigninWebView` captures `navigator.userAgent` using the supported
`injectedJavaScript` prop and receives it through `onMessage`. WebKit runs the
script at document end without calling the unsafe imperative method. The handler
accepts only the tagged user-agent message from the provider's cookie domain.

Cookie capture waits for the user-agent message when requested. Both load-end
and message arrival can trigger capture, so their arrival order does not matter.
Serializd does not request user-agent capture and keeps its cookie-based flow.
Android keeps its existing imperative `evaluateJavaScript` user-agent capture;
it receives neither the injected script nor the message handler.

This is an app-level JS change and hot reloads. No dependency patch or library
replacement is required.

## Write bridge fix (2026-10-06)

The `Shinobu-2026-10-06-135506.ips` simulator report confirms the same trap
when logging: `NitroWebViewEvaluateJavaScriptHandler.evaluate` calls WebKit on
`com.facebook.react.runtime.JavaScript`. `nitro-webview` remains at 0.1.0.
The Legend List container-pool warning is unrelated to this native crash.

The shared diary/watchlist runner now hands the film path and submission script
to the mounted React bridge. Each request remounts the hidden WebView with
`source` and `injectedJavaScript` together, so the script is installed before
the film loads and runs at document end. No imperative evaluator or load-wait
handshake is used. WKWebView's shared cookie store preserves the signed-in
session across remounts.

Because document-end scripts run again on reload, each request is consumed in
tab-local `sessionStorage` before issuing its write. A reload cannot duplicate
the diary entry. The runner still returns receipts through `onMessage`, times
out ambiguous writes without retrying, and rejects pending writes on disconnect.
Executable bridge tests cover diary and watchlist payloads plus reload safety.
On the booted iOS 26.5 simulator, both native page-load paths returned HTTP 200
probe receipts through `onMessage` without crashing. Their injected scripts
used a local fetch stub, so no diary or watchlist write reached Letterboxd.
Real provider write verification remains a human check.
This fix also hot reloads; no native rebuild is required.

## Alternatives checked on 2026-09-29

The latest npm release is still `0.1.0`. Upstream `main` also calls the
evaluator without a main-thread dispatch. Upgrading does not currently fix it.

The supported `injectedJavaScript` prop installs a document-end user script,
which can send the user agent through `onMessage` without the unsafe imperative
call. It does not execute when changed on an already-loaded page, so the write
bridge remounts with the script installed before loading the film.

`react-native-webview` supports Fabric and runtime `injectJavaScript` commands.
Migrating both sign-in and the write bridge would avoid maintaining a library
patch, but requires replacing Nitro's native cookie-reading API too. Do not
substitute `document.cookie` for a native cookie jar without checking HttpOnly
requirements.

No dependency patch is retained.
