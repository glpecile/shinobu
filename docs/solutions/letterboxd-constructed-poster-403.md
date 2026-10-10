# Constructed Letterboxd poster URLs return 403

## Investigation (2026-10-10)

The watchlist/list HTML provides a numeric film ID, film slug and cache key,
not the actual poster filename. Constructing a 600×900 CDN URL from those
fields is only a guess, not a reliable artwork API.

Unauthenticated Bun GET probes:

| Film | Guessed 600×900 | Guessed 230×345 | Film-page JSON-LD poster |
| --- | --- | --- | --- |
| Onibaba (`49601`) | 403 | 200 | `sm/upload/3x/qu/ti/2g/nITg6iRWo3CVWJEnhV4AiD3ukfx-…` |
| Alien (`51714`) | 403 | 200 | `sm/upload/8v/f1/qw/aa/bg7K6VtUG7Ew70gQj6SSroD5d4R-…` |
| 21 Grams (`51632`) | 403 | 403 | `sm/upload/ee/gx/q4/xd/Aps7GzrYiJZKHNT524Rsg4jaXej-…` |
| Obsession (`1234472`) | 403 | 403 | `1234472-obsession-2025-2-…` |
| Tuner (`1234878`) | 200 | 200 | `1234878-tuner-…` |

Different sizes working for the same film show that a 403 is not sufficient
evidence of a client-wide Cloudflare challenge. Some poster assets live under
an unrelated upload path; others use a filename different from the film slug.
Changing dimensions or adding headers cannot reliably repair those guesses.

Public film HTML exposes the exact portrait poster in Movie JSON-LD `image`.
`og:image` is a landscape social preview and is not a poster fallback.
Recover only after a constructed image fails, cache by film slug, validate the
CDN URL, and leave the original image in place if recovery fails. This replaces
the earlier advice to treat every constructed-URL 403 as permanently missing
art in `letterboxd-no-api-fallback.md` and `letterboxd-public-list-pages.md`.

Web relays only the public film HTML through the existing GET-only Worker;
artwork loads directly from the CDN. No AJAX endpoint, image proxy, session
forwarding, dependency or native rebuild is needed.

Validation: the resolver returned canonical images with HTTP 200 for Onibaba,
21 Grams and Obsession, including Onibaba through the local Worker relay.
The iOS simulator's public `jack/50-classics-to-rewatch-in-2026` list recovered
21 Grams and other initially blank posters into visible artwork.
