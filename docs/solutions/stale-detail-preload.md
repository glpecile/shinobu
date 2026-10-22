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
