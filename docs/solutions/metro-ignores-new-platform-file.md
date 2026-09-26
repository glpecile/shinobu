# A new `index.android.tsx` doesn't take effect until its importer changes

**Symptom:** after adding `foo/index.android.tsx` next to an existing
`foo/index.tsx`, the Android app kept rendering `index.tsx`. Neither Fast
Refresh, a dev-menu Reload, nor a force-stop fixed it, and edits to the new
file never showed.

**Cause:** the running Metro server caches each importer's resolution of
`@/…/foo`. Adding a higher-priority platform file doesn't invalidate that
cache, so Metro serves the old target until the importing module is
re-transformed. A cold bundle request (`curl …/index.bundle?platform=android`)
does resolve the new file, which makes it look as if Metro is fine.

**Fix:** edit and save every file that imports the module (append a line, then
remove it), or restart Metro with `bunx expo start --clear`.
