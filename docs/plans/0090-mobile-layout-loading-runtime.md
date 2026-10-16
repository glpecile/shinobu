# Mobile layout, loading feedback, and runtime

- Keep diary trailing counts/times visible by letting only the title portion shrink.
- Give the search field a short, fully visible title-search placeholder.
- Use the standard 56dp FAB for scroll-to-top; keep compact inline log actions small.
- Show discussion fetching on the options trigger after the refresh sheet closes.
- Keep visited list tabs mounted, without fetching an untouched neighbour, and
  reserve Android's refresh indicator for an explicit pull, not background reads.
- Show per-episode runtime alongside the known series total in card actions,
  without “est.”; fade in runtime metadata with reduced-motion support.

Validate with Firefox/Chromium mobile layouts, native Android where available,
the existing tests, lint, typecheck, and repository checks. Run independent
correctness and complexity reviews before publishing one PR.
