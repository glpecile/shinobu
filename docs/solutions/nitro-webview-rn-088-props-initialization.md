# Nitro WebView crashes on React Native 0.88

The SDK 58 iOS development build compiled successfully but crashed immediately
when a connected Letterboxd session mounted its hidden write WebView. Expo
Doctor did not detect the incompatibility.

The Expo development launcher's crash report identified
`HybridNitroWebViewComponent`: React Native requires every `RCTViewComponentView`
subclass to initialize `_props` in its constructor. Published Nitro WebView 0.1.0
and 0.2.2 omit that initialization.

Upstream merged the React Native 0.88 migration in
https://github.com/l2hyunwoo/nitro-webview/pull/53. Commit
`275e9185a7d969ec08e96368d3825db70e796acb` regenerates the native bindings with
Nitrogen 0.37.1, initializes the default props, and declares matching React Native
and Nitro peers. Pin that commit until a published version includes it. There is
no local dependency patch. Bun must trust this package's `prepare` script, which
runs TypeScript to produce its `lib` entry point from the Git checkout.

Clean-prebuild both native projects after changing this dependency. Its Android
package namespace changed since 0.1.0, so stale autolinking output also fails to
compile. Keep the generated directories untracked.
