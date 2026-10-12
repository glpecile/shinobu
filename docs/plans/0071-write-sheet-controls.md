# Write-sheet controls (#204)

- Match the native and web watched-date field to the Like button's 44px height
  and pill radius without changing date or like behavior.
- Share one neutral, rounded, clipped surface between the provider summary and
  its expanded options; remove the nested bordered box and red summary border.
  Selected rows retain subtle accent fills and accent checkmarks.
- Show the empty-selection guidance inside the summary row in regular-weight,
  softer red text using the theme's accent-on-tonal token,
  rather than as a red error below the picker.
- Morph the summary as selection changes through the existing `MorphText`,
  keeping its reduced-motion fallback and clipping long labels inside the row.
- Keep selection checkmarks, All/None, provider labels and the standalone
  watchlist picker. Do not change write routing or submit any provider writes
  during verification.
- Resolve Letterboxd film metadata when the card-actions sheet opens, then
  apply the details query's catalogue metadata before checking release status.
  Released current-year list films must offer logging; unknown or future
  releases keep the existing gate. Reuse cached queries, not a list-wide fetch.
- Validate lint, typecheck, class names and simulator interactions. Attach
  collapsed and expanded before/after screenshots to the PR.
- JS-only: hot reload; no native rebuild.
