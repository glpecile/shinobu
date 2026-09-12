# A `<Redirect>` off a lookup route flashes black and restarts the skeleton

## Symptom

Tapping an AniList cast/crew card on a detail screen pushed
`/person/lookup?name=…` and, on Android, produced this sequence:

1. the detail screen cross-faded into the lookup route's `PersonSkeleton`,
2. **one or two fully black frames** — no back button, no content,
3. the *same* skeleton again, from the top,
4. the person page.

Not reproducible on web.

## Cause

`/person/lookup` and `/studio/lookup` were pure resolution hops: suspend on a
TMDB name search, then

```tsx
return <Redirect href={routes.person(match.tmdbId)} />;
```

Expo Router's `Redirect` is a `router.replace`, so that is a **second stack
transition** immediately after the push. The native-stack default on Android
fades the outgoing screen out and the incoming one in against the window
background, so the two screens are briefly both near-zero opacity — the black
frames. `/person/[id]` then mounts its own `<Suspense>` and starts a second
`PersonSkeleton` from zero while its own query runs.

Web never showed it: `Redirect` there is a history replace with no stack
animation.

## Fix

The lookup routes render the resolved page themselves instead of navigating to
it — one screen, one Suspense boundary, one skeleton that stays up across both
legs. The page body moved into `features/person/person-details-view.tsx` and
`features/studio/studio-details-view.tsx`, shared with the `[id]` routes.

For `/person/lookup` this was required anyway: its AniList failover can resolve
a person who has no TMDB id, and `/person/[id]` has no way to address one.

## Rule

A route whose whole job is resolving an id **renders the destination**; it does
not `Redirect` to it. A redirect after a push is two transitions where the user
asked for one.
