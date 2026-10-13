# Up Next cards: enlarged text and missing metadata

The cards use rem-based Uniwind sizes on web, but the horizontal rail used a
pixel height. Raising the root font from 16px to 32px grew a 196px card to
392px while its rail stayed 196px, clipping the title and log action.
`episodeCardRailHeight` now returns rem on web, including Calendar's stack
headroom, and pixel heights derived from font scale on native. The skeleton
uses the same sizing. Its action allowance is the small FAB's 44px.

An empty backdrop must fall through to recovered artwork or the poster, not
win over it through nullish coalescing. The card keeps a placeholder under the
image so decoding/network failures and initial loading never leave empty art.

Blank media titles read “Untitled”; blank episode titles omit the separator
in the shared `entryLabel`. Badge rows wrap within the artwork rather than
clipping under enlarged text. Non-finite runtime/backlog values are omitted,
and backlog counts use locale grouping.

The dev-only `/up-next-demo` renders the real card and rail with Demo data,
Worst case, Empty, One and 1,000 cards, plus Ready/Loading actions. Preview
actions never write to providers. It redirects home outside development.
