# Match home placeholders to the loaded row geometry

The Up Next placeholder reserved 188px for the calendar content, while loaded
cards reserve 196px plus 10px of stack headroom at default text size. Its
Continue Watching placeholder also lacked the loaded rail's fixed-height box.
Together they pushed later rows downward when the query resolved. Watchlist
headers added another 16px when their 44px View all target appeared.

Both Up Next states now use `episodeCardRailHeight(fontScale)` and the same
stack offset. The placeholder uses the real collapsible headers, respecting
stored collapse preferences. Day placeholders match the loaded cells' stack,
without adding border width or an extra date margin. Feed-row placeholders
reserve the View all target height only where the loaded row has that action.

Rows that genuinely resolve empty still disappear; this does not reserve
permanent blank feed sections or delay independently fetched sections.
