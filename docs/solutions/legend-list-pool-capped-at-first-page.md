# Legend List caps its first container pool at the first page

**Symptom (2026-11-07).** `/anime-seasons` on web warned "No unused container
available, so creating one on demand" once page 2 loaded, with
`numContainersPooled: 50`.

Legend List 3.6 sizes its pool once, in `doInitialAllocateContainers`, and
caps it at `max(data.length, numContainers)`. The first render also caps the
draw distance at 50px. An AniList page is 50 items, so the pool is 50. With 8
columns and a two-row `drawDistance`, the next page's window needs 72 or more
containers, and every one past the pool warns. 3.7.2 has the same logic.

No prop sets the pool size. A smaller `estimatedItemSize` raises the first
container count only by making the first layout wrong, and a shorter
`drawDistance` brings back the fling gap on native. The poster wall keeps its
real-size estimate, which takes the web sidebar off the row width
(`useWallMetrics`), and the first-page warning stays until upstream grows the
pool on append.

Related: `legend-list-estimate-excludes-item-margin.md`, where an over-sized
estimate was the whole cause.
