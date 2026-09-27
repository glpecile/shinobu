---
status: pending
priority: P2
---

# Secure Token Storage Review

`react-native-mmkv` was chosen for OAuth token persistence because it's universal
across web + native without a platform-split wrapper (web falls back to
`localStorage`). MMKV supports an `encryptionKey` option on native — this should be
turned on for the token storage instance once a real token flow exists. Web has no
equivalent (plain `localStorage`, unencrypted), which remains a residual risk; revisit
whether that's acceptable or whether web needs a hardened fallback (mirroring
bluesky-social/social-app's `state/persisted` platform-split pattern).

Unblocked. Trakt, Letterboxd, Serializd and Simkl sessions now persist through
`state/session/tokens.ts`; AniList's code is in but still awaits owner client-id
registration and live verification (`todos/002`). Checked 2026-09-27: the single
`createMMKV({ id: 'session' })` store still has no `encryptionKey` and holds
sessions, user-entered Trakt client secrets and the optional TMDB token.

Before enabling native encryption, choose where the key lives and account for
existing unencrypted installs: verify MMKV's migration behavior rather than
silently making persisted sessions unreadable. Then re-evaluate the web
`localStorage` risk; native encryption does not protect web tokens. This is a
security review and migration task, not just an option flip.
