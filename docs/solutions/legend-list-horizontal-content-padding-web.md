# Horizontal Legend List rows lose their leading padding on web

**Symptom (2026-07-25).** On web every home carousel sat flush against the
sidebar and bled off the right edge, while its own section header stayed inset
by `px-4` — the row and its title no longer shared a left edge. Native was
fine. The rows had carried `contentContainerStyle={{ paddingHorizontal: 16 }}`
since the ScrollView → Legend List swap in plan 0024 (`MediaCarousel`); the
`ScrollView` they replaced used `className="px-4"` and never showed this.

**Cause.** A virtualized list positions its items *absolutely* inside the
content container, and the two layout engines disagree about what a parent's
padding means for an absolutely positioned child:

- **Yoga (native)** lays an absolute child out against the parent's *content*
  box, so `paddingLeft` shifts it.
- **CSS (web)** makes the containing block the parent's *padding* box, so
  `left: 0` lands at the inner border edge and `padding-left` shifts nothing.

So the same prop that insets a native row is a no-op on web. It survives
unnoticed on *vertical* lists because there the horizontal padding narrows the
content box, and item widths are computed from that width rather than from an
absolute x offset — which is why the watchlist grid keeps its gutters on web
while the carousels lost theirs.

**Fix.** Make the gutter a real element instead of padding — Legend List
measures `ListHeaderComponent`/`ListFooterComponent` on the main axis
(`rect.width` when `horizontal`) and folds that size into every item offset, so
a spacer behaves identically on both engines:

```tsx
ListHeaderComponent={<View style={{ width: EDGE_GUTTER }} />}
ListFooterComponent={<View style={{ width: EDGE_GUTTER - CARD_GAP }} />}
```

The trailing spacer is short by one gutter because each card already carries its
own `mr-3`; without that subtraction the row ends 28px from the edge and starts
16px from it.

**Rule of thumb.** For a *horizontal* `components/List`, express edge insets as
spacer components. `contentContainerStyle` padding is only trustworthy on the
cross axis, and `className` isn't an option either — uniwind drops it on
third-party components on native
(`docs/solutions/uniwind-classname-third-party-components.md`).
