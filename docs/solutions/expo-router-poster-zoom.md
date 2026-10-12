# Expo Router poster zoom on iOS

`Link.AppleZoom` needs an `asChild` Link inside Router's Stack. An imperative
`router.push` loses the source identifier that Expo adds to the Link's href.
Shinobu's detail routes already use a headerless root Stack, so no navigator
or native dependency changes are needed (SDK 57; iOS 18+).

Pressto's `onPress` argument is `AnimatedPressableOptions`, not React Native's
cancellable press event. It cannot be used directly as a Link child when the
Link's onPress calls `preventDefault`. MediaCard therefore uses core Pressable
on iOS, with `allowRoutePush` sharing the module-level guard used by
`usePushRoute`. The guard receives the plain `routes.details` destination,
not the source-specific zoom params. Android and web retain PresstableScale.

Only displayed artwork enables the zoom source. Missing/loading/failed artwork
and Reduce Motion omit AppleZoom, retaining ordinary stack navigation. Source
and zoom destination images disable their own crossfade on iOS so mounting the
native source wrapper or target does not add a second image animation.

The iOS Link carries `zoomPoster`; details pin that URI instead of switching
to whichever poster TMDB enrichment returns. The target wraps a fixed-size
poster box, including in the loading skeleton, rather than Galeria's internal
view hierarchy. Shared/deep links without the parameter retain normal artwork
selection. Android/web ignore it.

Keep explicit `w-28 h-40` dimensions on ZoomableImage inside the target box.
Its web implementation inserts an unsized PresstableOpacity button between
the box and the image; `w-full h-full` resolves against that button, not the
target box, collapsing the poster to its 2px border. Verified on
`/details/simkl/2799393`: percentage sizing reproduced a 2px height; explicit
sizing restored a loaded 112 × 160px poster and clicking opened the lightbox.

## Verification

On an iPhone 17 Pro simulator running iOS 26.5, runtime inspection confirmed
Expo's native zoom enabler and source identifier on the detail route, with the
same poster URI as the source. Open/Back restored the source card. A double-tap
produced one detail route; completing an edge-back gesture returned Home.

Automated flow replay was not established: the running development app had no
native-devtools connection for stable selector capture. AniList also returned
rate-limit errors during exploration. Reduce Motion, missing/failed artwork,
cancelled dismissal, and cross-instance rapid taps still need device-level QA;
the existing push-guard tests cover duplicate-route suppression independently.

Reference: https://docs.expo.dev/router/advanced/zoom-transition/index.md
