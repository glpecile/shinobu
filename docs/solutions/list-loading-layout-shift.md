# List loading geometry

The title placeholder uses a blank line in the real title font, with the
skeleton drawn over it. This preserves native font rounding and scaling.
Use a nonbreaking space: browsers collapse a regular space into an empty
line, shortening the header by 12px. The web placeholder is capped at 224px
and shrinks with its container.

Sort and view controls depend only on local preferences, so render them
before provider data arrives. Reuse `MediaToolbar` to keep its rail, spacing,
and native control widths identical to the loaded page.

The watch-history spinner and completed progress ring share a leading 20px
slot. Loading is an inline status; only a failed read needs the 44px retry
button. Reserve a 20px metadata row rather than 44px to avoid extra native
spacing. Center its flex lines with `alignContent`: React Native Web defaults
to `flex-start`, which otherwise shifts shorter content upward inside the
reserved space.

Poster skeletons apply their 2:3 aspect ratio to the poster inside the padded
cell, just like `PosterWall`. Applying it to the padded cell made each
skeleton poster four points too tall at the iPhone 17 Pro's three-column
width, moving the second row when content arrived.

## Verification

At 402×874 on iOS, the compact header measured 132.67pt instead of 156.33pt,
with matching loading and completed-history geometry. The initial poster
check also compared the first two rows against their skeletons.

Chromium checks at 1728×973 and 390×844 verified unchanged header, owner,
indicator-slot, and count positions between loading and completed history.
The count width changes to fit the completed fraction. Failed reads still
expose an enabled retry button. The web title placeholder measured 224×28px
on desktop and 222×28px at phone width. Android was not visually checked.
