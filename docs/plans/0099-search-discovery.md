# Search discovery

Replace the empty title-search landing state with the four existing public
discovery rows: seasonal anime, seasonal anime films, trending movies, and
trending TV. Keep the search field pinned as a compact header above full-width
rows on every platform. Use the actual status-bar inset plus 8 points above
the field, 8 points below, and 8-point native / 16-point web horizontal gutters.
Omit the Discover introduction and leave bottom clearance for the scope FAB.

Reuse the home rows and their query cache. Give each row its own suspense and
error boundary. Keep the existing title-search results and the cast/crew and
studio idle states. Discovery cards use Search's existing actions sheet.

Remove these four public discovery rows from Home. Keep its personal sections
and the Back to top sign-off.

Validate the idle layout, scrolling, card navigation, search and clear, and
scope switching on native and web where available. Run the repository's
static checks. Source-only changes hot reload without a native rebuild.

Validation: lint, typecheck, class-name, router-push, link, and diff checks pass.
Verified the compact header and discovery rows on web, iPhone, and Android.
Search/clear, card navigation, and scope switching pass in Chromium;
search/clear also pass on Android. iPhone scrolls through the rows while
dismissing the keyboard. Home ends after the personal sections.
