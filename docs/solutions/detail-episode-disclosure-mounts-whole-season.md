# Episode disclosures must virtualize rows, not seasons

Dragon Ball Z's first season has 39 interactive episodes. `SeasonAccordion`
mapped them inside `Collapse` in the details page's `RefreshableScrollView`,
so opening the season mounted every pressable/button at once. Virtualizing
season containers would retain the same cost; a vertical list nested inside
that scroll view and sized to its full content would not bound the work either.

The details page now has one screen-height `List`, with the hero and remaining
sections as its header/footer. Like diary disclosures, expansion lives in the
list and determines which individual episode rows enter its data. Recycling
stays off because episode cells own hover state. Sizes are estimates, not fixed
heights, so wrapping and font scaling remain measurable.

A non-suspense query subscriber supplies the flat data while the same cache's
suspense query owns the season heading's loading/error boundary. The heading
stays in the list header, so scrolling doesn't replay its entrance or remount
its boundary. A failed episode fetch doesn't remove the hero, credits or other
independently fetched sections.

Device timing/feel verification is left to the owner; no speedup is claimed
from the static checks or flat-row tests alone.
