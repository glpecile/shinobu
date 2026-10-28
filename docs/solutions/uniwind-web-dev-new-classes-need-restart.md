# A new class does nothing in `bun web` until Metro restarts

**Symptom (2026-10-28):** `self-end` and `-left-10` added to the season rows
reached the DOM but computed to nothing in the running `bun web`. The class
names were in the element's `className`, and no `.self-end` rule existed in
any stylesheet. A fresh `expo start` on another port rendered them correctly.

**Cause:** Uniwind builds the web stylesheet inside Metro's transform of
`src/global.css`, scanning every source file for candidates at that moment
(`node_modules/uniwind/dist/metro/transformer.mjs`, `compileTailwind`).
Nothing marks `global.css` dirty when a component changes, and Metro caches
by content hash, so `touch` doesn't help either. A class the project didn't
use when the server started never gets a rule.

**Fix:** restart `bun web` after adding a class the codebase hasn't used
before. Confirm a rule exists by searching `document.styleSheets` for the
selector before blaming the markup. Production builds scan fresh and are
unaffected.
