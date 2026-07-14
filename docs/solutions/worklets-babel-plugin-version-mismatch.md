# Worklets "Mismatch between JavaScript code version and Babel plugin version"

## Symptom

After a clean native rebuild, the app throws repeatedly at startup:

```
[Worklets] Mismatch between JavaScript code version and Worklets Babel plugin
version (0.10.0 vs. 0.10.1).
```

pointing at the first `react-native-gesture-handler` import — while
`node_modules` contains exactly **one** `react-native-worklets` copy whose
package version, runtime `jsVersion` constant, and bundled Babel plugin all
agree (0.10.0). `bun pm ls` and the lockfile agree too. Nothing installed is
actually mismatched.

## Cause

Every worklet the Babel plugin transforms gets a `__pluginVersion` stamp, and
the runtime compares it against its own `jsVersion` in dev
(`serializable.native.js`, `cloneWorklet`). The stale side lives in **Metro's
transform cache**, not in the project: `$TMPDIR/metro-cache` is shared across
runs (and across projects on the machine), it survives `expo prebuild --clean`
and native rebuilds, and its cache key does **not** include the worklets
plugin version. So Metro happily serves worklet code transformed by a
different plugin version (from an earlier install state or another repo)
against the current runtime.

A native rebuild does not help because nothing native is wrong — the poisoned
artifact is a cached JS transform.

## Fix

Stop the dev server, delete the transform caches, restart with a cold cache:

```sh
rm -rf "$TMPDIR/metro-cache" node_modules/.cache
bunx expo start --clear
```

No `expo prebuild` / pod install / native rebuild is needed (unless the
*native* half of the error mentions the native library version — that one
does need a rebuild).

## Rule of thumb

Any Reanimated/Worklets version-mismatch error where every version you can
find on disk agrees ⇒ suspect `$TMPDIR/metro-cache` before touching versions.
Bumping package versions "to match" the phantom number makes it worse: it
desyncs JS from the already-built native library and forces a real rebuild.
