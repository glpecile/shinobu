# 4chan browser catalog reads need the approved same-origin proxy

On 2026-10-09, a GET to `https://a.4cdn.org/a/catalog.json` with
`Origin: http://localhost:8081` returned 200 but
`Access-Control-Allow-Origin: http://boards.4chan.org`. This does not allow
Shinobu's browser origin. Direct browser catalog reads cannot work.

The user explicitly approved a third bounded Worker proxy exception on
2026-10-09 so web can perform the same lookup as native. The existing Worker
serves only GET `/api/fourchan/{a|tv|co}/catalog.json`, targeting the fixed
`api.4chan.org` host. It rejects queries, other paths/methods, redirects, non-JSON
and malformed JSON; forwards no client headers; relays no upstream cookies or
CORS headers; and bounds upstream latency. Successful public responses cache
for one minute. There is no account, database, or request logging in the relay.

Both platforms share title matching and external preview cards. Native stays on the
public JSON API. Threads disappear as they expire; there is no archive lookup.
The section and its search links are hidden when no catalog produces a title match.
Independent board queries preserve other boards' matches when one fails.

Local web dev needs `bun run dev:worker` and a restart of `bun web` after the
new prefix is added to `metro.config.js`. Production needs a Worker deployment;
changing the app alone does not create the same-origin endpoint.

## Local Worker failures and 4stats investigation

Live Chromium checks from `http://localhost:8081` confirmed that both direct
4cdn reads and `https://api.4stats.io/activeThreads/a` fail browser CORS. The
same 4stats endpoint succeeds from `https://4stats.io`; its CORS header permits
only that origin. Its UI uses that backend endpoint, which returned eight active
threads per board, not a complete searchable catalog. It is not a replacement
for the full-catalog lookup and is not used by Shinobu.

The first local implementation had two failures: an already-running Metro
served its SPA HTML at the new proxy prefix until restarted, and workerd rejected
`redirect: 'error'` immediately. Workers supports `manual` or `follow`; use
`manual` and reject 3xx responses. After that correction, workerd received 429
from `a.4cdn.org` while the official `api.4chan.org` host returned 200 JSON with
the same catalog shape. The Worker therefore uses the latter; native stays on
4cdn. Do not relay challenge HTML or follow redirects as a workaround.

Verified through the restarted Metro server in Chromium: all three same-origin
catalogs returned 200, and the episode page for TMDB TV 321518 showed thread
291481805 without a discussion error. That TMDB item initially lacks anime
IDs; reuse `useAniListIdByTmdbQuery` so its resolved AniList identity sends it
to `/a/`, without misclassifying Western animation. Gaps belong between actual
preview cards, not between suspense wrappers that can resolve to empty content.
At a 390px viewport, the heading and first card both started at x=24.

The example `/a/thread/291481805` was live and its subject carried both
`Sekai Saikyou no Majo, Hajimemashita` and `The World&#039;s Strongest Witch`.
Its opening post said “What a great first episode.” but had no numeric episode
identifier. Such matches must be labelled show discussions, not verified episode
discussions. Never render the post HTML or fetch replies/full-resolution images.
The user subsequently requested opening-post previews: the catalog's `tim`
builds a direct `i.4cdn.org` thumbnail URL, never a proxied image endpoint.
Spoiler-marked and deleted files stay hidden.

## Preview cards and web presses

Do not set pressto's role to `link` on web: RNGH only dispatches the press for
its default button role (`web-pressto-accessibility-role-kills-onpress.md`).
The preview accessibility label names its external destination instead.
Chromium verified thread and romaji-search clicks open the correct new tabs.
The demo's loaded and loading card bounds match, with a 16px gap and no
vertical shift between sections. The aggregate board results do not use section
rise animation, so cards do not move against an already-loaded rail.

Stress checks at 320px, 390px, and 2560px, with doubled text size and RTL,
found clipping from the fixed card height and narrow-screen width, blank failed
images, empty subjects, and truncated large thread IDs. Compact cards now use
a minimum height, a narrow-screen width, a thumbnail fallback, a literal
thread-title fallback, and wrapping metadata. The dev-only demo keeps these
fixtures and its URL-backed controls for future checks.

The page shows compact cards and uses an ellipsis beside Discussion to open the
shared Sheet. The sheet is titled Search discussions and contains only
title/romaji Search on /board/ actions, not another thread list. Chromium checks
verified opening, searching, and closing at 320px, 390px, and desktop widths,
including enlarged text, a single thread, and twelve matches. Mocked movie
catalogs verified that empty/failed lookups hide the entire section while one
successful board remains visible when the other boards fail.
