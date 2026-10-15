# Filter toolbar spacing

- Reuse the watchlist's `MediaToolbar` for person/studio filmographies and the
  anime-season format row: 24pt gutters, 12pt gaps, fading horizontal filters,
  and a fixed view toggle.
- Keep the role label at its full width rather than truncating it. Give native
  segmented controls a bounded width inside the rail; share loaded/skeleton geometry.
- Align the season picker's gutters with the header and toolbar, and use the same
  segmented-control size for season and format.
- Verify Android overflow, role selection, studio filters, and season/format
  switching; run static checks and the existing suite. Source-only, no rebuild.
