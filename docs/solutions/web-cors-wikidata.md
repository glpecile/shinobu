# Web CORS: Wikidata SPARQL — browser-callable, keyless, scores are sparse

**Verified:** 2026-10-25, with `curl` and a foreign `Origin` header against
`https://query.wikidata.org/sparql` (#318, the details Ratings section's Rotten
Tomatoes and Metacritic scores).

## Findings

| Probe | Result |
| --- | --- |
| `GET /sparql?query=…`, `Origin: http://localhost:8081`, `Accept: application/sparql-results+json` | 200, `access-control-allow-origin: *`, `cache-control: public, max-age=300` |
| `OPTIONS /sparql`, `Access-Control-Request-Headers: api-user-agent` | 200, `access-control-allow-headers: accept, content-type, content-length, user-agent, api-user-agent` |

- No key and no account. `Accept` is CORS-safelisted, so a plain GET needs no
  preflight. `Api-User-Agent` triggers one, and the preflight allows it.
- Wikidata's user-agent policy asks every client to identify itself. Browsers
  can't set `User-Agent`, so `lib/providers/wikidata/ratings.ts` sends
  `Api-User-Agent` on every platform instead.

## What the data looks like

- Scores are `P444` statements qualified by `P447` (source), `P459`
  (determination method) and `P585` (point in time). One source can hold
  several dated statements, so the read keeps the newest per source.
- Rotten Tomatoes records both the Tomatometer (`87%`, method `Q108403393`) and
  an average (`8.1/10`, method `Q108403540`), often with different dates. Only
  the Tomatometer is shown. Metacritic's Metascore is `74/100` (`Q106515043`).
- IMDb scores are in there too (`Q37312`). They're ignored, because IMDb comes
  from Simkl.
- The page ids for the link-out are `P1258` (`m/inception`) and `P1712`
  (`movie/inception`).
- Lookup keys: TMDB movie `P4947`, TMDB TV `P4983`, MAL anime `P4086`,
  AniList anime `P8729`. A MAL id can match more than one item (the series
  and its franchise).
- Coverage is volunteer work. Inception and The Matrix have both scores.
  Breaking Bad (TV) and Frieren (anime) have none, though both carry the page
  ids. An empty answer is normal, not an error.

## Probe

```sh
curl -s -D - -G https://query.wikidata.org/sparql \
  -H 'Origin: http://localhost:8081' \
  -H 'Accept: application/sparql-results+json' \
  --data-urlencode 'query=SELECT ?score ?source ?date WHERE {
    ?item wdt:P4947 "27205" .
    ?item p:P444 ?s . ?s ps:P444 ?score ; pq:P447 ?source .
    OPTIONAL { ?s pq:P585 ?date } }'
```
