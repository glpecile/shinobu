# Trakt progress episodes have no `season` field

## Symptom

Marking an episode as watched appeared to do nothing: the mutation succeeded,
`invalidateQueries` fired, the progress query refetched — but no checkmark ever
appeared in the season accordion and the button never flipped from "Mark as
watched" to "Rewatch". It looked like a cache-invalidation bug; it wasn't.

## Cause

Episodes in the `/shows/:id/progress/watched` response carry only `number`,
`completed`, and `last_watched_at` — **no `season` field**. The season number
lives only on the enclosing season object:

```json
{
  "seasons": [
    {
      "number": 1,
      "episodes": [
        { "number": 1, "completed": true, "last_watched_at": "..." }
      ]
    }
  ]
}
```

This differs from the `/shows/:id/seasons?extended=full,episodes` catalogue
payload, whose episodes *do* carry their own `season` field — easy to assume
the progress endpoint matches, and it doesn't.

`normalizeWatchedProgress` built its watched keys from `episode.season`, so
every key came out `"undefined-1"`, `"undefined-2"`, … and never matched the
accordion's `"${season.number}-${episode.number}"` lookup. The unit test passed
because its fixture invented the `season` field the real API never sends.

## Fix

Build the key from the enclosing season (`normalize.ts`,
`normalizeWatchedProgress`):

```ts
keys.add(`${season.number}-${episode.number}`);
```

and drop `season` from `TraktProgressEpisode` so the type can't invite the
mistake back.

## Lesson

When hand-writing an interface for a provider payload, fixture the test from a
real captured response (or the docs' example JSON verbatim), not from the
interface — a fixture derived from the interface only proves the code agrees
with its own assumptions.
