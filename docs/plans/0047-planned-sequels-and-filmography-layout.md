# Planned sequels and filmography layout

- Read anime prequel list statuses in the existing AniList list request. A
  planned premiere reaches Continue Watching only when its anime prequels are
  completed. Keep upcoming entries in Calendar and CURRENT progress unchanged.
- Add the shared grid/list toggle at the trailing edge of filmography controls.
  Reuse the locally persisted Watchlist/explorer view preference and MediaCard
  with credit-aware actions under the existing collapsible year headings.
  Show the same watched eye as the list on watched posters.
- Match loading controls to their loaded sizes and reserve the same biography
  preview height on person pages. Reuse the shared skeleton components and
  render poster placeholders when the saved view is grid.
- Stagger the person header, biography and filmography controls by 40ms with
  160ms ease-out fades. Skip the stagger for reduced motion and never animate
  virtualized credit mounts.
- Bound the filmography list's viewport and reserve the controls row's height
  when a format has only one role. Refresh the README screenshots and verify
  the shared poster toggle on Android.
- Validate the premiere regression, timeline grouping, types, lint and web UI.
  Publish one PR, run ponytail review, then squash-merge and update main.
