# Prebuild fails: DOMParser.parseFromString "undefined" mimeType

**Symptom:** `expo prebuild` (via `bun ios.clean`) dies in
`withIosInfoPlistBaseMod`:

```
TypeError: [ios.infoPlist]: withIosInfoPlistBaseMod: DOMParser.parseFromString:
the provided mimeType "undefined" is not valid.
```

**Cause:** two `@xmldom/xmldom` majors coexist. `@expo/plist@0.8` calls
`parseFromString(contents)` with no mimeType — fine on xmldom 0.8.x, a hard
error on 0.9.x (the argument became mandatory). Adding
`@react-native-vector-icons/ionicons` brought in `plist@3` (dep of its config
plugin), which hoisted `@xmldom/xmldom@0.9.x` to the root of `node_modules`.
`bun.lock` was still correct (`@expo/plist` pins a nested 0.8.13), but the
incremental install left a **stale duplicate** `@expo/plist` nested under
`@expo/config-plugins/node_modules/` with no nested xmldom of its own — that
copy, not present in the lockfile at all, resolved the root-hoisted 0.9.x.

**Fix:** the lockfile was never wrong — the installed tree was. Clean
reinstall:

```
rm -rf node_modules && bun install
```

After that the stray nested `@expo/plist` is gone and
`@expo/config-plugins` → `@expo/plist` → nested `@xmldom/xmldom@0.8.13`
resolves correctly; prebuild and pod install pass.

**Rule of thumb:** any prebuild/config-plugin TypeError coming from inside
`node_modules/**/node_modules/*` after adding or removing dependencies — check
for install-tree drift (a nested package on disk that `bun.lock` doesn't
list) before suspecting the plugin itself.
