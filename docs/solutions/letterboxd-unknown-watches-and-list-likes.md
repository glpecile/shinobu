# Public Letterboxd reads cannot prove every personal state

Reported against `https://letterboxd.com/melis_/list/black-mirror/` with the
public username `glp` on 2026-10-14. Letterboxd showed 28/28 watched and liked;
Shinobu showed 9/28 and an empty heart.

Two independent gaps:

- A public member-film page is not a complete watched-membership endpoint.
  Anonymous GET `/glp/film/black-mirror-the-national-anthem/` returned 404 while
  `/glp/film/black-mirror-bandersnatch/` returned a valid viewing. A 404 cannot
  establish unwatched state: an undated watched flag need not create that page.
- List likes are observed from the already-loaded liked-list index. A cold or
  partially paginated index cannot establish absence. Public page 1 of glp's
  liked lists had another page and did not contain this list.

The bounded correction is to retain unknown state: incomplete watched counts
are lower bounds, and an unknown like offers the original list rather than a
blind like/unlike mutation. No automatic full-library pagination, new proxy
paths, or authenticated read transport is introduced. Matching the website's
exact personal state remains a provider-read limitation, not a CSS issue.

These checks used public GETs only, without persisted credentials or writes.

Plan 0092 removes the confusing `+` on the watched numerator. The count's
accessible description and browser tooltip retain "At least" for incomplete
history. A denominator `+` still means more list entries can be loaded. These
are independent uncertainties; loading every film cannot make personal history
complete, even when the observed count matches Letterboxd's website.
