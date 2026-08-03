# AniList connect on production web redirected to localhost:8081

**Symptom (2026-08-03).** On shinobu.glpecile.xyz, tapping AniList → Connect
bounced through anilist.co and landed on `localhost:8081/#access_token=…` —
"Unable to connect" on a phone, token lost.

**Root cause — two stacked gotchas:**

1. **`.env.local` is loaded in every NODE_ENV**, including the
   `expo export` that `bun run deploy:web` runs. It held the *dev* AniList
   web client id (registered redirect `http://localhost:8081`), with the prod
   one commented out. AniList pins ONE redirect URL per client and ignores
   any `redirect_uri` param, so the deployed bundle's authorize URL always
   came back to localhost.
2. **Metro's transform cache keeps stale env values.** After fixing the env
   files, a plain `expo export` still baked the old id — `EXPO_PUBLIC_*` vars
   are inlined by a babel transform, and cached transforms don't re-run when
   only env files change.

**Fix:**

- Web AniList client ids now live in NODE_ENV-scoped files Expo picks
  automatically (both beat `.env.local`):
  - `.env.development.local` → localhost client (used by `expo start`)
  - `.env.production.local` → shinobu.glpecile.xyz client (used by
    `expo export`)
  No more comment-toggling one line in `.env.local` — that was the failure
  mode.
- `build:web` now passes `--clear` so a deploy can never ship
  transform-cached env values.

**Verify after any env change:** grep the exported bundle for the id you
expect (`grep -l <client-id> dist/_expo/static/js/web/*.js`) before
`wrangler deploy`.
