# Sorting a list that mixes bare dates and ISO instants

## Symptom

Calendar (plan 0030) interleaves two kinds of entry: episodes, which carry a
full ISO instant from Trakt (`2026-07-25T02:30:00.000Z`), and film releases,
which carry a bare calendar day (`2026-07-25`). The section sorted them with the
string compare it had used since it only held episodes:

```ts
.sort((a, b) => (entryInstant(a) ?? '').localeCompare(entryInstant(b) ?? ''))
```

That is not a comparison of times once the two shapes are mixed:

- `'2026-07-25'` sorts **before** `'2026-07-25T…'` whatever the time of day is,
  so every release files ahead of every episode sharing its date string — even
  one airing at 00:05.
- Worse, the two strings don't name the same clock. An episode airing Friday
  23:30 in a UTC-5 timezone is `2026-07-25T04:30:00.000Z`, so it sorts *after* a
  release the user reads as Saturday's. The user sees Saturday's film above
  Friday's episode.

Same class of bug as the one `lib/time/has-aired` exists to prevent — comparing
provider date fields as text rather than as instants.

## Fix

Parse before comparing, through the same `parseLocalInstant` everything else in
the feature uses (bare date → **local** midnight, ISO instant → itself), and
sort numerically:

```ts
function entryOrder(entry: UpNextEntry): number {
  const instant = entryInstant(entry);
  const parsed = instant == null ? null : parseLocalInstant(instant);
  return parsed?.getTime() ?? Number.POSITIVE_INFINITY;
}
```

`src/features/up-next/compute.ts`. Entries with no instant sort last rather than
first — a missing time is not "the beginning of the week."

Deliberately *not* fixed by normalizing releases to an instant at the source:
`entryInstant` hands back the raw string so `isDateOnly` can still suppress the
00:00 time badge a flattened release would grow (plan 0030 KTD-1).

## Lesson

The moment a sorted list can hold values from two providers or two shapes,
`localeCompare` on a date field is a bug waiting for the first mixed row. Parse
to an instant and compare numbers. This applies to any future list that mixes
them — notably the notification batch, which sorts candidates by `fireInstant`
and will hold both episode instants and 09:00-local release instants.
