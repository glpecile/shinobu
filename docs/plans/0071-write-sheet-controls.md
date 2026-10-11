# Write-sheet controls (#204)

- Match the native and web watched-date field to the Like button's 44px height
  and pill radius without changing date or like behavior.
- Share one neutral, rounded, clipped surface between the provider summary and
  its expanded options; remove the nested bordered box and red summary border.
  Selected rows retain subtle accent fills and accent checkmarks.
- Show the empty-selection guidance inside the summary row in regular-weight,
  softer red text using the theme's accent-on-tonal token,
  rather than as a red error below the picker.
- Keep selection checkmarks, All/None, provider labels and the standalone
  watchlist picker. Do not change write routing or submit any provider writes
  during verification.
- Validate lint, typecheck, class names and simulator interactions. Attach
  collapsed and expanded before/after screenshots to the PR.
- JS-only: hot reload; no native rebuild.
