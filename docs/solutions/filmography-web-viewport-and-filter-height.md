# Filmography viewport and filter height on web

Legend List's web scroller needs its own bounded height. Its parent filling
the screen is not enough: without `style={{ flex: 1 }}` on the list, startup
can measure the content as the viewport, disable virtualization, and exhaust
the cell pool. Bound the list rather than suppressing the warnings or changing
row estimates to compensate for the oversized viewport.

The role picker disappears when a format has only one role. It is taller than
the format and view controls, so removing it also shortened the controls row.
The shared controls' inner row now reserves `min-h-10`, including in the
skeleton. On Chromium, the format control, view toggle and row bounds stayed
identical before and after the role picker disappeared.
