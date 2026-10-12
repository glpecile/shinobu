# Shared sheet dismissal

- Extend the existing cross-platform Sheet with a compound Header. It reads
  dismissal from the sheet context, with an override for inline write steps.
- Reuse the log header's quiet pill button, reserving space beside the heading
  so long titles never overlap it. Keep settled writes' Done checkmark.
- Use the shared header for artwork headings, copy options, pickers, discussion
  search, watchlist forms/reports, and the native provider sign-in modal.
- Remove redundant footer Cancel actions; the header keeps their dismissal
  behavior, including returning to the previous inline watchlist step.
- Preserve backdrop, Back, and write behavior.
- Add a title/year copy option without parentheses alongside the existing one.
- Center compact picker labels beside their close button and space the whole
  header above the options, rather than putting the gap inside the label.
- Validate lint, types, class names, and existing tests. JS-only; hot reload.
