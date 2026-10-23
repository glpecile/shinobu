# A stale preload flashes the wrong detail screen

Expo Router keeps hidden preloaded screens by stack route name. Without a
`getId`, pushing a different item on that route promotes the hidden screen
and replaces its params. Its previous item's content can flash first.

`allowRoutePush` refreshes a mismatched preload before pushing. This must also
work after preloading another route kind: touching detail A, opening episode
B, then pressing "Open show" can otherwise promote the hidden detail A.
Checking only whether the last preload has the same top-level path misses it.

The navigation regression test checks that the destination is preloaded before
the push in that sequence. It fails with the same-kind restriction restored.

## A pending preload slides the page in twice (Android)

Expo Router reduces a batch of only preloads inside a React transition, and a
push urgently. A heavy details screen (Letterboxd films most often) was still
rendering its press-in preload when the tap's push arrived, so the urgent push
promoted an older hidden screen from an earlier press-in. React then replayed
the preload and push, the active route's key changed, and Android animated a
replace: stale page, a gray frame, then a fresh copy sliding in again.

`usePreloadRoute` passes `inTransition: false`, so the preload commits before
the push. The push still lands on the screen the press-in rendered.
