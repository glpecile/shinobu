# Shared spinner and poster rail

- Route every React Native activity indicator through `components/spinner`, preserving existing sizes and theme colors; lint blocks direct imports outside the wrapper.
- Replace search's leading icon while any query in the selected scope is fetching, including subsequent queries with previous results still visible.
- Let the filmography title and its skeleton hide their vertical rail stub in poster mode; preserve list-mode rails and the horizontal divider.
- Validate with lint, type checks, tests, and a web build. Source-only changes hot reload; no native rebuild.
