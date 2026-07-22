# Headless smoke-testing the web build (Playwright)

**Added 2026-07-22.** How to drive the Expo **web** build in a real headless
browser to screenshot a screen/component and surface console + network errors —
without adding Playwright to the project. Same tool already used to diagnose
`web-fouc-on-boot.md`. This is an **on-request** workflow (an agent runs it when
asked), not CI.

## Prereqs — nothing to install

Playwright and its browser binaries are already on this machine (cached from prior
use), reachable via `npx` with **no** entry in `package.json`:

```sh
npx playwright --version          # 1.61.1
ls ~/Library/Caches/ms-playwright  # chromium, chromium-headless-shell, webkit
```

Do **not** `bun add playwright`. It's not a project dependency; a committed source
file that imports it would be dead weight and would break `bun typecheck`. Keep all
scripts in the scratchpad (throwaway) and run them via the symlink shim below.

Start the web server first (serves on `http://localhost:8081`):

```sh
bun web   # expo start --web
```

## The one gotcha: don't screenshot the boot loader

The app paints a full-viewport `#boot-loader` overlay (忍 + "Shinobu") until fonts
load — see `web-fouc-on-boot.md`. On an Expo **dev** server, `waitUntil:
'networkidle'` and short fixed timeouts **race that overlay** and you screenshot the
splash instead of the screen. Always wait for the loader to detach:

```js
await page.waitForSelector('#boot-loader', { state: 'detached', timeout: 20000 });
```

For the built-in CLI (no `#boot-loader` wait available), wait for a real app
element instead, e.g. the web sidebar nav (web = left sidebar per
`platform-native-nav-idioms`):

```sh
--wait-for-selector "text=Home"
```

## Quick screenshot — built-in CLI (no script)

Good for a fast look at a route. Dark scheme + desktop viewport + wait for real
content:

```sh
npx playwright screenshot \
  --color-scheme dark \
  --viewport-size 1280,900 \
  --wait-for-selector "text=Home" \
  http://localhost:8081/            shot.png

# a specific route:
npx playwright screenshot --color-scheme dark --viewport-size 1280,900 \
  --wait-for-selector "text=Settings" \
  http://localhost:8081/settings    settings.png

# mobile viewport (the app is universal — check the phone layout too):
npx playwright screenshot --device "iPhone 15" --color-scheme dark \
  http://localhost:8081/            home-mobile.png
```

The CLI **can't** capture console errors or clip to a component — use the script
for those.

## Screenshot + console/network errors — script

The CLI can't report errors, so use a tiny script. Playwright isn't installed, so
symlink the npx-cached copy into the scratchpad `node_modules` once, then run with
plain `node`:

```sh
SP="$SCRATCHPAD"                 # your session scratchpad dir
mkdir -p "$SP/node_modules"
NM=$(dirname "$(find ~/.npm/_npx -maxdepth 4 -name playwright -type d | head -1)")
ln -sf "$NM/playwright"       "$SP/node_modules/playwright"
ln -sf "$NM/playwright-core"  "$SP/node_modules/playwright-core"
```

`$SP/probe.mjs`:

```js
import { chromium } from 'playwright';

// usage: node probe.mjs <url> <out.png> [clipSelector]
const [url = 'http://localhost:8081', out = 'shot.png', clip] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({
  colorScheme: 'dark',
  viewport: { width: 1280, height: 900 },
});

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[net] ${r.url()} ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
// Wait out the #boot-loader overlay (web-fouc-on-boot.md) — networkidle races it.
await page.waitForSelector('#boot-loader', { state: 'detached', timeout: 20000 }).catch(() => {});
await page.waitForTimeout(500); // settle a frame after removal

// Whole page, or clip to one component via a selector's bounding box.
if (clip) await page.locator(clip).first().screenshot({ path: out });
else await page.screenshot({ path: out });

await browser.close();
console.log(errors.length ? `CONSOLE ERRORS (${errors.length}):\n${errors.join('\n')}` : 'No console errors.');
```

Run it:

```sh
cd "$SP"
node probe.mjs http://localhost:8081/              home.png            # full screen
node probe.mjs http://localhost:8081/details/123   poster.png  "[data-testid=poster]"  # one component
```

Prints `No console errors.` or the collected errors, and writes the PNG.

## Before/after PR screenshots (on request)

When asked for before/after shots on a PR, screenshot the **base branch** and the
**PR branch** of the same route, then attach both to the PR. The dev server hot-
reloads on checkout, so keep one `bun web` running and just switch branches.

```sh
BASE=main; ROUTE=http://localhost:8081/settings; SP="$SCRATCHPAD"

# stash any dirty state so checkout is clean, remember current branch
git stash -u 2>/dev/null; BRANCH=$(git rev-parse --abbrev-ref HEAD)

git checkout "$BASE"
sleep 4   # let Metro hot-reload the route
node "$SP/probe.mjs" "$ROUTE" "$SP/before.png"

git checkout "$BRANCH"
sleep 4
node "$SP/probe.mjs" "$ROUTE" "$SP/after.png"

git stash pop 2>/dev/null || true
```

Attach to the PR by uploading both images in a comment (drag-drop in the GitHub UI,
or `gh` with an image host). A clean side-by-side in the PR body:

```md
| Before (`main`) | After |
| --- | --- |
| ![before](before-url) | ![after-url) |
```

**Caveats.** `git stash -u` before checkout or the switch fails on a dirty tree —
and restore with `stash pop` after. Shoot the **same route + same viewport** both
times or the diff is noise. If the change is native-only (not JS/TS under `src/`),
web screenshots won't show it — web can't render native surfaces.

## Related

- `web-fouc-on-boot.md` — the `#boot-loader` overlay this waits out.
- `web-cors-*.md` — for probing provider APIs from a browser origin, drive the same
  headless page and watch the network/console instead of screenshotting.
