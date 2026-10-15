# Biography Markdown

- Replace the biography's link-only renderer with `react-native-enriched-markdown`
  for bold, italics, links, and paragraph formatting on native and web. Nitro
  Markdown has no web runtime, so it would require a second implementation.
- Keep plain descriptions on the existing Text path. Always preserve AniList's
  biography Markdown, including descriptions without links.
- Keep the native line clamp and unconstrained hidden measurement, measuring
  rendered heights so Markdown and plain text can share the disclosure. Web
  retains its existing height transition.
- Use theme colors and the loaded Inter faces, adding the real italic face.
  Allow only HTTP(S) link opening. Disable unused math and code highlighting.
- Extend the existing AniList biography regression, then run focused tests,
  typecheck, lint, class/link checks, and a web export. Mobile needs
  `bun ios.clean` / `bun android.clean` after adding the native renderer.
