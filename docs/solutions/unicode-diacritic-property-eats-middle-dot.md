# `\p{Diacritic}` silently eats U+00B7 MIDDLE DOT when slugifying names

## Symptom

The Letterboxd person-URL slugifier (`letterboxdPersonSlug` in
`lib/providers/external-urls.ts`) turned `"WALL·E"` into `walle`, not
`wall-e` — so the generated link 404'd. Every accented Latin name slugified
correctly, which is exactly why it wasn't obvious: the bug only fires on the
handful of titles/names that use a middle dot as a *separator*.

## Root cause

The usual NFD-then-strip idiom is:

```ts
name.normalize('NFD').replace(/\p{Diacritic}/gu, '')
```

`\p{Diacritic}` is **not** "combining marks left over by NFD". It is a
Unicode *binary property* whose set includes standalone, spacing characters
that are merely diacritic-*ish* — among them **U+00B7 MIDDLE DOT**, U+00B4
ACUTE ACCENT, and the modifier letters. NFD never produces those; they're
already there in the source string as real, meaningful characters.

So the strip ran **before** the non-alphanumeric→hyphen pass and deleted the
separator outright, instead of leaving it for that pass to turn into `-`.
`walle` — one word, no hyphen, wrong URL.

## Fix

Strip `\p{Mn}` (Nonspacing_Mark) instead. That is precisely the category NFD
decomposition emits, and nothing else:

```ts
name.normalize('NFD').replace(/\p{Mn}/gu, '')
```

`WALL·E` → `WALL·E` (dot survives the strip) → `wall-e` (dot becomes a hyphen
in the separator pass). Accent folding is unchanged: `Joaquín` → `joaquin`.

## Where else this idiom appears

`lib/providers/mapping/pick-movie-match.ts` uses the same
`\p{Diacritic}` strip. It is **not** broken there — that code normalizes both
sides of a *fuzzy title comparison*, so deleting the dot on both sides still
matches. The bug only bites when the output is a **URL path segment**, where
a dropped separator changes the identity of the thing being addressed.

Rule of thumb: `\p{Mn}` for anything whose output is an identifier; either
works for symmetric comparison.

## Also learned: Letterboxd 403s automated person-URL probes

`scripts/check-external-urls.ts` (the `link-health.yml` liveness probe)
deliberately does **not** cover the person builders. Two reasons: the URLs are
name-parameterized rather than static constants, and a direct fetch of
`https://letterboxd.com/actor/peter-otoole/` returns **HTTP 403** to
non-browser clients — the same fingerprint wall documented in
`letterboxd-web-proxy.md`. A Letterboxd person check would fail the scheduled
workflow permanently. The AniList staff-search URL would probe cleanly if
coverage is ever wanted.
