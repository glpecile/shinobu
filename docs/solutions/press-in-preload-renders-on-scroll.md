# A press-in preload renders a hidden screen on every scroll

Poster grids, rails, and result rows used to call `router.prefetch` on press-in,
so the push after a tap landed on a mounted detail screen. Press-in comes from
gesture-handler's `onBegin`, which fires as the finger lands. A scroll or fling
that starts on a poster also begins there, and nearly every scroll on a poster
grid does.

Each preload rendered a full hidden `DetailsScreen` with its queries. The React
profiler on a Pixel 8 Pro showed a 600 ms dev commit (about 200 ms in release)
0.1 s after a scroll swipe, with no tap. On a Letterboxd list whose per-film
reads already kept the JS thread busy, flings stalled and recycled cells showed
blank.

The head start was only the time the finger stayed down, about 100 ms. The
preload also caused the stale-screen flash and the double slide on Android
(a pending preload promoted under the push). The preload is gone. A tap renders
the screen after the press, and the push guard and focus check in
`lib/navigation` still stop duplicate pushes.
