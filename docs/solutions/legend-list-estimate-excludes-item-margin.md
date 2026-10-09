# Legend List estimates exclude the item's own margin

The `/lists` grid warned "No unused container available, so creating one on
demand — likely caused by the estimatedItemSize being too large." The grid's
`estimatedItemSize` had been sized as card height + the item wrapper's `mb-3`
gutter.

Legend List measures container sizes with `getBoundingClientRect().height`
(web) or `onLayout` (native): border-box, **excluding the margin on the item
wrapper**. Its container pool is preallocated from `estimatedItemSize` (the
`disclosure-list-pool-needs-short-row-estimate` precedent), so counting the
12px gutter over-sized the initial pool and it ran short on every scroll pass.

Set the estimate to the card's own advance — `h-44` art (176px) — not art +
gutter. Layout still measures each real row and item types learn their own
averages; the estimate only sizes the pool. Keeping the gutter on the item is
free because an under-estimate is capped, while an over-estimate (art +
gutter) is what warns. Verify with the measure that real borders push a
border-box to 178px — still just under an art-height estimate.