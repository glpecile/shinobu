# Incoming media links

## Scope

Handle Letterboxd `/film/{slug}/`, IMDb `/title/{tt-id}/`, and AniList
`/anime/{id}` and `/manga/{id}` links on Android. Add explicit links on both
native platforms, such as `shinobu://open?url=<encoded HTTPS URL>`.
Keep OAuth callbacks and existing Shinobu routes unchanged.

## Implementation

- Register separate, unverified Android VIEW filters for each host and path.
  Android 12+ users must enable the domains in the app's Open by default settings.
  iOS cannot claim third-party HTTPS domains.
- Rewrite incoming links through Expo Router's `+native-intent` to details IDs.
  Validate hosts and paths before routing or fetching.
- Reuse AniList's public ID query and Simkl's IMDb lookup. For Letterboxd,
  fetch the public film HTML on native, extract its body TMDB movie ID, then
  reuse Simkl's exact-ID lookup. Do not widen the web proxy.
- Preserve Letterboxd's slug on the resolved record for writes and View on.
- Offer an external browser fallback when a supported item cannot resolve.
- Keep outgoing links on `openExternalUrl`, which uses an in-app browser on
  native and a separate tab on web. Never send View on through incoming routing.

## Validation

Test incoming URL routing, trust-boundary rejection, preservation of existing
routes and auth callbacks, and Letterboxd's public HTML lookup. Run typecheck,
lint and navigation/classname checks. Android intent filters require a clean
native rebuild; test OS dispatch after installation.
