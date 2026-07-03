---
status: pending
priority: P3
---

# Secure Token Storage Review

`react-native-mmkv` was chosen for OAuth token persistence because it's universal
across web + native without a platform-split wrapper (web falls back to
`localStorage`). MMKV supports an `encryptionKey` option on native — this should be
turned on for the token storage instance once a real token flow exists. Web has no
equivalent (plain `localStorage`, unencrypted), which remains a residual risk; revisit
whether that's acceptable or whether web needs a hardened fallback (mirroring
bluesky-social/social-app's `state/persisted` platform-split pattern).

Blocked on: todos 001/002 (and, eventually, 004) landing first, so there's a real
token flow — across all connected providers — to secure.
