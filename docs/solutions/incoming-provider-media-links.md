# Incoming provider media links

## Platform constraints

Android filters for Letterboxd, IMDb and AniList are unverified. Shinobu does
not own their domains or their `assetlinks.json`. On Android 12+, users need
to enable supported domains under Settings, Apps, Shinobu, Open by default.
Do not add `autoVerify` or iOS associated domains for sites we do not control.

Both native platforms can open explicit links such as:

```text
shinobu://open?url=https%3A%2F%2Fletterboxd.com%2Ffilm%2Falien%2F
shinobu://open?url=https%3A%2F%2Fwww.imdb.com%2Ftitle%2Ftt0078748%2F
shinobu://open?url=https%3A%2F%2Fanilist.co%2Fanime%2F1
```

## Exact Letterboxd identity

On 2026-10-02, a plain GET of `https://letterboxd.com/film/alien/` returned
200. The body has `data-tmdb-type="movie" data-tmdb-id="348"`. Use this
identity for Simkl's public lookup. Do not guess the title from the slug or
call the challenged `/json/` or image endpoints. The web proxy's allowlist
remains unchanged; cold Letterboxd film resolution is native-only.

The same live probe resolved both IMDb `tt0078748` and TMDB movie `348` to
Simkl `53624`, Alien. Simkl's response only included its own ID, so retain
the incoming IMDb ID and the scraped TMDB ID when merging the resolved item.
Otherwise View on and exact metadata lookups lose the identity we already know.

## Avoid link loops

Inbound links go through `+native-intent`. Outbound View on buttons and the
failed-lookup fallback use `openExternalUrl`, which opens a native in-app
browser instead of `Linking.openURL`. On Android, pass an explicit browser
package from `getCustomTabsSupportingBrowsersAsync`. Expo's `openBrowserAsync`
otherwise creates an unscoped VIEW intent, even for a Custom Tab. Sending an outbound provider link to
the OS would allow it to reopen Shinobu when the user enabled its domain.

The Android filters need `bun android.clean`, not hot reload. After installing,
test both a cold and a warm launch with a supported HTTPS link and the explicit
scheme. Check View on still opens the external page and OAuth still returns to
`shinobu://redirect`.
