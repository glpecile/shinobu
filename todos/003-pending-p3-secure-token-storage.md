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

Unblocked (2026-07-20): the token flows this depended on have landed — Trakt
(`todos/001`, done) and Letterboxd (`todos/004`, done); AniList (`todos/002`) is
code-complete pending live client-id registration. Real tokens now persist through
`state/session/tokens.ts`, whose header comment explicitly defers the `encryptionKey`
to this todo. Ready to pick up: turn on MMKV `encryptionKey` for the native token
store and re-evaluate the web (`localStorage`, unencrypted) residual risk.
