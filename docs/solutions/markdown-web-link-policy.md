# Markdown browser links need more than a press guard

`react-native-enriched-markdown` renders web links as anchors with the original
destination in `href`. Its `onLinkPress` callback intercepts ordinary clicks,
not browser context-menu commands or middle clicks. An HTTP(S)-only callback
therefore still leaves unsupported schemes such as `mailto:` as active links.

The app's web `MarkdownLinks` boundary removes unsupported `href` attributes.
It checks existing anchors when attached, then observes child and `href`
mutations because Enriched parses Markdown asynchronously in WASM. Mutation
observer callbacks run before the next user-input task, so the browser cannot
activate an unsupported destination. The ref disconnects the observer on
unmount. Native keeps the HTTP(S)-only press handler and disables link previews.

Both paths use `httpUrl` for absolute-URL and protocol validation. Keep the
web DOM regression for initial content and asynchronous replacement: checking
only the press callback would miss the original context-menu bypass.
