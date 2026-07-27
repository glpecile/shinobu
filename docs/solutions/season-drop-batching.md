# Collapsing a same-day season drop into one card and one notification

## Symptom

Batman: Caped Crusader drops all of season 2 on one Friday. Trakt's
`/calendars/my/shows` returns one row per episode, so Up Next's Calendar
rendered **ten near-identical cards** — same backdrop, same "In 4 days", same
04:00 — whose only differing field (`S2E1`, `S2E2`, …) is the smallest text on
the card. Everything else airing that day was pushed off the right edge of the
row, and the week strip's dot cap made the day look like five things when it was
two.

The notification batch had the same shape: `computeNotificationSchedule`
produced ten candidates, so the user got ten alerts on one morning for one show,
and the drop consumed a fifth of `MAX_SCHEDULED` (50) on its own. A 24-episode
drop would have pushed every other show's airing out of the batch entirely.

## Fix

Two collapses, deliberately in different layers.

**Rendering** — `features/up-next/group.ts`. `groupDayEntries` turns a day's
entries into `UpNextGroup[]`, and `EpisodeCard` renders a group of >1 as a stack
(two dimmed card backs behind the face card, plus a count chip). `UpNextEntry`
stays one-per-episode through dedupe, ordering, the hidden-items filter and the
day bucketing — only the row that draws cards collapses, so nothing downstream
of a card had to learn about batches.

**Scheduling** — `collapseBatches` in `compute-schedule.ts`, which is a separate
collapse rather than a read of the grouped view, because the schedule runs on a
background task with no rendered section to consult.

## The four non-obvious parts

### 1. Batch on the local **day**, not the instant

Trakt routinely staggers a batch's `first_aired` by a minute or two, so keying
on the exact instant splits a drop into ten batches of one. "The season dropped"
is a claim about the day. Both collapses therefore key on the local calendar day
(`localDayOffset`), which also means they inherit the timezone correctness
`lib/time` already owns — a drop at 23:00 origin-time doesn't split across two
days for a user in a different zone.

### 2. Collapse **after** the window filter, not before

`inWindow` drops airings that have already happened. Collapsing first would take
the earliest episode as the batch's lead — and if episode 1 landed an hour ago,
the whole batch would inherit its already-past instant and be dropped, silently
losing the notification for episodes 2–10.

Filtering first means a half-landed batch collapses only what is still ahead,
and its count states what the user has *yet to see* rather than what the
provider listed. Covered by `a batch already half-landed counts only what is
still ahead`.

### 3. `count` is optional so the stored hash stays valid

`hashSchedule` is compared against an MMKV-stored hash to decide whether to
cancel-and-reschedule the whole batch (plan 0020 R7). Adding a required `count`
to every episode candidate would have changed every subject string, invalidating
every stored hash and rescheduling every user's batch once on upgrade.

`count` is therefore **absent, never `1`**, on an ordinary single-episode
candidate, and `candidateSubject` only appends `x{count}` when it is present:

```ts
const code = `${candidate.season}/${candidate.episode}`;
return candidate.count == null ? code : `${code}x${candidate.count}`;
```

An unbatched episode's subject is byte-identical to the pre-batch one. It still
has to be *in* the subject, though — a batch that gains an eleventh episode must
reschedule, and keying on the lead episode alone would leave the tray claiming
ten.

### 4. Releases never batch

A film's theatrical and digital dates can fall on the same day and share an item
id, but they say different things ("In theaters" / "Streaming") — that is the
one fact each row exists to carry (plan 0030 R3). Both collapses key releases on
something that includes the release kind, so they can never merge. The Calendar
grouper keys them on their own entry id; the scheduler on
`release/{itemId}/{kind}`.

## Knock-on: the day-strip dots were counting the wrong thing

The week strip drew one dot per *entry*, capped at 5. A ten-episode drop pegged
the cap, so a day holding one season drop plus one other show looked identical to
a day holding five different shows. The dots now count **cards**
(`day.groups.length`), which is what they always meant.

## What is deliberately not here

- **No expand/collapse.** The stack is not tappable-to-expand; tapping it opens
  the show, where the episode list already exists. An inline expansion just
  rebuilds the crowded row the change exists to remove.
- **No episode range in the label.** "S2E1–E10" is only true when the numbers are
  consecutive, and a batch that starts mid-season or skips a number is common
  enough that the count is the field worth trusting. The label is
  `Season 2 · 10 episodes`, degrading to `10 episodes` when the batch spans
  seasons or the source states none (AniList carries no canonical season, plan
  0027).
- **No quick-log on a stack.** The checkmark logs a single episode and there is
  no honest answer to which of ten it would advance.
