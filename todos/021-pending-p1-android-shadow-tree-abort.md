# Investigate Android React Native/Reanimated commit abort

## Evidence

Pixel_9, Android 16 / API 36, arm64. Existing crash-buffer entry on 2026-10-14
at 03:12:49 for `xyz.glpecile.shinobu`:

```text
SIGABRT
ShadowTree.cpp:324: function commit: assertion failed (attempts < 1024)
facebook::react::ShadowTree::commit
libreanimated.so
com.swmansion.reanimated.NodesManager.performOperations
```

Process uptime was 2,774 seconds, so this record does not prove a cold-start
failure. Installed JS dependencies at investigation: React Native 0.86.3,
Reanimated 4.5.1. Native binary/dependency parity has not been verified.

A subsequent launcher/deep-link check reached the restored sign-in screen.
The triggering interaction and repeatability are unknown. Do not attribute this
to an outdated emulator or claim it fixed by a Metro reconnection.

## Next steps

- Capture the interaction leading to the next abort and a symbolicated native
  trace, without recording credentials or performing provider writes.
- Verify the installed development binary matches native dependencies. If not,
  use `bun android.clean`, not edits to generated Android files.
- Check supported upstream fixes and app-level animation/layout fixes before
  any dependency change. No third-party patches without owner approval.
