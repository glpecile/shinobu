# Shared log session

All logging triggers open one app-level host. Single-episode requests use the
existing catch-up session, regardless of whether they originate on Home, a
details page, an episode page, or a season row. Movies and anime films remain
one-shot; season selections remain one batched write.

Explicit episode requests derive subsequent aired, unwatched episodes from the
existing catalogue and provider progress reads, preserving canonical versus
entry-relative numbering. Freeze that queue on first confirmation, retain form
values, and reuse the existing ledger, retry, and Simkl coalescing behavior.
Failed reads degrade to the requested episode, never guessed episodes. Wait for
queue evidence before confirming. Episode-page logging no longer navigates away
while the sheet is walking the chain.

Verify queue boundaries, watched gaps, movie/batch dispatch, types, lint, and the
existing catch-up/fan-out tests. No native changes.
