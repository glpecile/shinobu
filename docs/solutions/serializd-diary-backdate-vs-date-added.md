# Serializd diary showed backdated logs on the day they were made

**Symptom:** log an episode with "Watched on" set to yesterday. Simkl and
Trakt show it on yesterday, but the Serializd row in the diary sits on today.
Serializd's own site shows the right day.

**Cause:** the diary normalizer set `watchedAt` to `dateAdded` (when the log
was created), not `backdate` (the day the user picked). It did this because
`/diary` pages by `dateAdded`, and the merge watermark used each provider's
oldest `watchedAt` as its frontier. Backdates are out of page order.

**Fix:** entries take `backdate`. `getSerializdDiary` returns the page's oldest
`dateAdded` as `readTo`, and `readFrontiers` (`features/diary/merge.ts`) uses a
provider's `readTo` before its entries. A log's backdate is normally no later
than its `dateAdded`, so every entry on a later page is older than `readTo`.
The cut stays gapless, and a backdated entry older than the cut waits until the
watermark reaches it. A log edited to a later day breaks that: it pops in above
the cut when its page loads.

`diaryStates` keeps the oldest `readTo` across pages, so the cut never rises.
