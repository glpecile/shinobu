# Settings on the diary rail

Settings moves from eyebrow-and-card groups to the diary's rail: one scroll, each
section a rail head (glyph ringed on the line, title, count, rule, chevron) that
folds like a diary day. The chosen variant is B in
`docs/brainstorms/2026-10-23-settings-redesign-variants.html`, which also holds the
worst-case data toggle the decisions below came from.

## Decisions

- Sections: Trackers, Notifications (native only), Metadata, Appearance, Hidden, About.
- `SettingsRail` (`src/features/settings/settings-rail.tsx`) is the section and row
  primitive; its head reuses `RailHead` through the new `RailHead.Icon` lead.
- Disconnect is the one label-only button (no glyph). Connect keeps `link-outline`.
- A connected tracker's subtitle is the username alone; the status dot says connected.
  An action the user must take (Trakt reconnect) gets two lines instead of truncating.
- Letterboxd shows Connect on web like every other tracker.
- Theme is three preview thumbnails (System split, Light, Dark). The selected one gets
  a foreground ring with a gap, plus a semibold label. Preview colours are tokens.
- Hidden items store `{ title, type }`. Entries saved before this are plain strings and
  read back without a type, falling back to the eye glyph. Rows show the type's glyph
  (film, tv, book, list) and label; an empty title reads "Untitled". The whole row
  opens the item or list, and the trailing Show unhides it.
- Hidden shows its first 5 in saved order, then "Show N more" / "Show less". Expanded
  results scroll in a virtualized five-row window. Search
  appears only past 20 hidden items and keeps the 5-row cap on its matches.
- Counts use singular and plural strings ("1 item", "3 items").
- The scrolled-past section pins under the header like `DiaryStickyDate`. Wide web adds
  an "On this page" index.
