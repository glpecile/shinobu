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

`ProviderSigninWebView` captures `navigator.userAgent` using the supported
`injectedJavaScript` prop and receives it through `onMessage`. WebKit runs the
script at document end without calling the unsafe imperative method. The handler
accepts only the tagged user-agent message from the provider's cookie domain.

Cookie capture waits for the user-agent message when requested. Both load-end
and message arrival can trigger capture, so their arrival order does not matter.
Serializd does not request user-agent capture and keeps its cookie-based flow.

This is an app-level JS change and hot reloads. No dependency patch or library
replacement is required. The Letterboxd write bridge still calls the imperative
evaluator and needs separate follow-up for the same iOS threading issue.

## Alternatives checked on 2026-09-29

The latest npm release is still `0.1.0`. Upstream `main` also calls the
evaluator without a main-thread dispatch. Upgrading does not currently fix it.

The supported `injectedJavaScript` prop installs a document-end user script,
which can send the user agent through `onMessage` without the unsafe imperative
call. It does not execute when changed on an already-loaded page, so it cannot
directly replace the write bridge's runtime navigation and submission commands.

`react-native-webview` supports Fabric and runtime `injectJavaScript` commands.
Migrating both sign-in and the write bridge would avoid maintaining a library
patch, but requires replacing Nitro's native cookie-reading API too. Do not
substitute `document.cookie` for a native cookie jar without checking HttpOnly
requirements.

No dependency patch is retained.
