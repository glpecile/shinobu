# Disclosure lists need a pool sized for their short rows

Legend List warned that all 14 pooled containers were occupied and two more
were needed. It preallocates from `estimatedItemSize`; a list of tall disclosure
headers can become a viewport full of shorter children when expanded.

Diary already inserts each expanded log as its own flat virtualized row. Its
66px initial estimate matched poster rows but under-provisioned the pool for
36px episode-log children. Use 36px for that initial estimate. Details similarly
uses a conservative 56px episode estimate instead of 72px headers. Item types
still learn their own averages and layout still measures actual row heights;
these are not fixed sizes and do not clip scaled text.

Do not silence Legend List's warning, mount the whole expanded body or add
recycling to stateful detail cells. Pool growth can still happen for unusual
data or viewport changes; these estimates target the normal expansion case.
