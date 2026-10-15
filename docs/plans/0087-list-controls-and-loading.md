# List controls and loading

- Use the shared small, quiet icon button for Android's view switcher so its
  pill, border, glyph, padding, and touch target match neighbouring toolbar actions.
  Keep the existing grid/list preference and iOS/web controls.
- Remove the idle pagination spacer from provider list indexes. Keep a compact
  gap before the external link, with loading and retry content only when needed.
- Reuse the list grid skeleton for next-page loading, matching the card columns
  and row pitch. Preserve the pagination threshold and duplicate/request guards.
- Verify Android toggling, footer spacing, loading/retry states, and pagination;
  attach before/after evidence to the PR and run lint, types, and relevant checks.
