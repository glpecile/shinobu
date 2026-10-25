# Sticky home rail headings

Keep each home rail's existing heading, collapse toggle, provider mark, and
View all action at the scroll viewport's top while its cards scroll beneath it.
Release the heading at its section's end so headings never overlap.

Use the shared CollapsibleSection for media, Up Next, and list rails. Web uses
CSS sticky, following the Settings fix for Firefox compositor scrolling.
Native follows the scroll on the UI thread and measures nested sections so
async rows and disclosure changes cannot leave stale offsets.

Check scrolling across headings, collapsing a pinned section, and horizontal
card scrolling. Run lint, typecheck, and class-name checks. This is a JS-only
change and hot reloads.

Rails without a provider mark (Continue Watching, This week, Your Watchlist)
lead with a muted `CollapsibleSection.Icon`, so every heading starts with a glyph.
`MediaCarousel` takes that slot as `leading` instead of a `provider` id.
