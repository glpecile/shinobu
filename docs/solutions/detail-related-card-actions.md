# Related and recommendation cards need the same actions as the feed

Details passed navigation to the Related and Recommendations carousels, but
omitted `onItemActions`. `MediaCard` consequently had neither a long-press
handler nor a web ellipsis, so the card-actions drawer was unreachable.

The details screen owns one existing `useCardActions` / `CardActionsSheet`
pair and passes its handler through both sections to their carousels. The
action callbacks on `MediaCard` and `MediaCarousel` are required, so TypeScript
rejects new card surfaces that omit this wiring. Navigation remains a separate
press; the sibling web ellipsis and long-press open the same drawer as the feed.
Hide-from-feed is disabled on these detail-only rows, as on search results.
