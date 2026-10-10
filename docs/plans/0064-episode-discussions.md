# Episode discussion links

- Add a Discussion section to native and web episode detail pages.
- Movies and series show the same section below Variants, without episode filtering.
  Anime films search `/a/`, `/tv/` and `/co/`.
- Use compact cards only. `/discussion-demo` is a dev-only stress preview with
  Demo data / Worst case, Empty / One / Many (12), and Loading / Loaded controls,
  persisted in its URL. Inline catalog results do not use section-rise animation.
  Cards fit 320px screens, grow for enlarged text, and fall back for failed images.
- Catalog loading is invisible: no header, skeleton cards, or reserved space
  before matches exist. Reveal results with a 180ms opacity-only ease-out fade
  (1ms with reduced motion). Skeletons belong only to genuinely loading thumbnails.
- Show matching compact cards in the rail. An ellipsis beside Discussion opens
  the shared Sheet titled Search discussions with only title/romaji catalog-search
  actions labelled Search on /board/. No View all link, duplicate thread list,
  or search pills on the detail page.
- Anime (including TV items with anime IDs) searches `/a/`; other series
  search both `/tv/` and `/co/`, without assuming animation is confined to one.
- Reuse the existing animation-gated ani.zip lookup for TMDB TV records that
  do not yet carry an anime ID, rather than treating every animated show as anime.
- Both platforms read each board's public catalog through the shared HTTP client and
  TanStack Query, cached per board for one minute across episode pages.
- Match full display/romaji/English/native titles against subjects and opening
  posts, ignoring HTML, entities, case and punctuation. Fetch AniList titles and
  known synonyms through its existing cached media query, including for TMDB anime.
  Try title initials (3–6 letters) only in subjects explicitly marked as an
  episode/discussion/general or a slash-delimited general. No fuzzy substrings.
- Explicit `S1E2` or `episode 2` markers must match the viewed episode. Unnumbered
  threads remain show discussions and may contain spoilers for later episodes.
- Horror movies and shows also match explicitly labelled Horror general,
  discussion, or thread subjects (including Horror & Supernatural General).
  Genre-wide matches require Horror metadata and are never episode-specific.
- External-link preview cards: opening-post thumbnail, decoded thread subject,
  board and thread number. No rendered HTML, replies or full-resolution media.
  Deleted/spoiler-marked images stay hidden. No generic section subtitle.
- On web, pressto links keep its button role so RNGH can dispatch presses;
  accessibility labels explain that they open 4chan. Check both thread and search clicks.
- Hide the entire section, including search links, when every board is empty or
  fails. Aggregate independent catalog queries so one failing board cannot hide
  another board's matches. Drawer search actions appear only for boards with matches. Browser
  lookup uses the explicitly approved third proxy exception: same-origin
  `/api/fourchan/{a|tv|co}/catalog.json` in the existing Worker. GET only, no query
  parameters, client headers, redirects, cookies, or upstream HTML. Native stays
  direct. See `docs/solutions/web-cors-fourchan.md`.
- Use thread 291481805 as the title-alias regression example, not a pinned link.
- No provider/session registration, backend, archives, dependencies or native build changes.
