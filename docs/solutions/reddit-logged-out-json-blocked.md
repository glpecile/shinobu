# Reddit's logged-out JSON API is blocked

Chan (moffatman/chan, `lib/sites/reddit.dart`) reads Reddit through the public
`www.reddit.com/r/{sub}/….json` and `/search.json?q=…&restrict_sr=true`
endpoints without an API key. On a 403 it loads the matching HTML page in a
WebView to collect anti-bot cookies, then retries once. When the retry also
fails, it asks the user to log in through its cookie browser.

Probed on 2026-11-01 from a residential IP (AS27747):

- curl, with or without a desktop UA, gets a 403 HTML page saying "You've been
  blocked by network security". Loading the HTML page first to pick up cookies
  doesn't help.
- Headless and headed Chrome (playwright-core) are blocked the same way.
  Headed Chrome's HTML page reports "Prove your humanity".
- Real mobile Safari on the iOS simulator gets the same block on `search.json`,
  even right after `/r/television/` rendered normally.
- `old.reddit.com/…/search.json` returns 302 to `/login/?reason=lor2`, a login
  wall for logged-out readers.
- `www.reddit.com/r/{sub}/search.rss?q=…&restrict_sr=on` returns 200 Atom with
  real results, but sends no CORS header. After one request it reports
  `x-ratelimit-remaining: 0` with a reset of 15–55 s, and 429s in between.

Logged-out JSON is closed to every client, Chan's WebView retry included. Only
an authenticated session (cookie or OAuth) reaches the JSON API. The Atom feed
allows about one request a minute per IP, and a browser can't read it without a
proxy.

## What Shinobu uses

The Discussion section searches one subreddit per item through the Atom
feed: r/anime for anime (romaji title), r/movies for films, and r/television
for everything else. Native reads `www.reddit.com` directly. Web goes through
the approved fourth Worker exception, `/api/reddit/{sub}/search.rss?q=`
(`worker/reddit-proxy.ts`). Results are cached for ten minutes. The Reddit read
has its own `SuspenseSection`, but a 429 or block page stays in the query cache
as no posts instead of throwing: React logs every boundary-caught error with
`console.error`, which LogBox shows on native. Refresh in the Discussion sheet
refetches it. Atom entries
have no spoiler flag, so Reddit cards never show thumbnails.

Wait for the existing ani.zip identity and AniList title reads before starting
Reddit. Searching the initial TMDB title first spends the IP budget before the
romaji search can run. The 4chan cards remain available during enrichment.

Every web user shares the Worker's egress IP, and with it the one-search-a-minute
budget. If production returns 429s, add an edge cache in front of the
upstream fetch rather than more retries.
