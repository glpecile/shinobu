# Feed carousel disclosure motion

Animate the feed's collapsible media rows, including Your Watchlist, using
the existing disclosure components and 200 ms motion token.

- Native uses `DISCLOSURE_LAYOUT` in the toggle handler to animate the layout
  change and content opacity, as the season accordion does.
- Web uses `Collapse` to transition the body height on opening and closing.
- Keep the existing chevron, persisted preferences, and virtualized lists.
- Respect reduced motion. No new dependencies or native build changes.

Validate types and lint. Check opening, closing, and rapid reversal on native
and web, including with reduced motion enabled.

## Shared sections and diary

Extract the persisted feed header and animated body into `CollapsibleSection`
for media carousels and Up Next. Share native layout scheduling in
`useDisclosureToggle`. Diary day toggles use the same scheduling on native;
web keeps the original flat recycled list without item layout transitions.
Always-on transitions also animate the initial position measurements and fight
the screen entrance. Reduced motion disables native scheduling. Web disclosure
bodies render at natural height on mount and enable transitions only on a toggle.
