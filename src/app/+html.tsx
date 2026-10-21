// Learn more https://docs.expo.dev/router/reference/static-rendering/#root-html

import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  // This is only required for server-side rendering.
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } =
    useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/*
          `interactive-widget=resizes-content`: Android browsers otherwise
          overlay the keyboard on the layout viewport, so bottom-anchored UI
          (FABs, sheets) sat behind it. iOS Safari ignores it.
        */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, interactive-widget=resizes-content"
        />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/*
          Every visual style in Shinobu (layout, colors, dark theme) comes
          from Uniwind's compiled Tailwind stylesheet, loaded via a single
          external <link> that Expo injects into `headNodes` below. Static
          export bakes the fully-styled markup into this document, but
          until that stylesheet finishes loading, the browser paints it
          with zero styling applied — a flash of raw black-on-white HTML
          before it snaps into the real (usually dark) UI on boot. See
          docs/solutions/web-fouc-on-boot.md.

          This inlines just enough critical CSS to close that window: the
          correct background color instantly (no network round trip), and
          text colored to match it so any unstyled text is invisible
          rather than a flash of plain black copy. Once the Uniwind
          stylesheet loads, its class selectors (e.g. `.bg-background`)
          outrank this element selector and take over normally.

          Colors are hardcoded, not `var(--color-background)` — that
          custom property is defined in the same stylesheet that hasn't
          loaded yet. Must stay in sync with the `--color-background`
          light/dark values in `src/global.css`.
        */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html {
                /*
                  Without this the document is \`color-scheme: normal\`, i.e.
                  light, so the browser paints its *own* surfaces light however
                  dark the page is: the canvas behind/around the viewport that
                  Firefox for Android shows while a page transition runs (it
                  read as a white → black fade), overscroll, scrollbars and
                  form controls. Declaring both keeps it following
                  prefers-color-scheme rather than pinning either one.
                */
                color-scheme: light dark;
              }
              html, body {
                background-color: #0a0a0a;
                color: #0a0a0a;
              }
              #boot-loader {
                background-color: #0a0a0a;
              }
              @media (prefers-color-scheme: light) {
                html, body {
                  background-color: #ffffff;
                  color: #ffffff;
                }
                #boot-loader {
                  background-color: #ffffff;
                }
              }
            `,
          }}
        />

        {headNodes}

        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}

        {/*
          `#boot-loader` is a plain sibling of `#root` — not part of the
          React tree at all — so hydration can never touch or remove it.
          It exists because two things paint before the app is actually
          ready to be seen on web: (1) React Navigation's Stack always
          paints its own screen-container background as an inline style —
          `rgb(242, 242, 242)` from its vendored DefaultTheme
          (expo-router/build/react-navigation/native/theming/DefaultTheme.js)
          — regardless of Shinobu's own dark/light theme, since nothing
          themes it (see `contentStyle` on the Stack in `_layout.tsx` for
          the belt-and-suspenders fix to that specifically); and (2) every
          Uniwind/Tailwind utility class the static export bakes into this
          document (`bg-background`, `text-foreground`, layout, spacing)
          is inert until the external stylesheet loads. Together that's a
          real, reproducible flash of the wrong gray background with
          unstyled text on boot (docs/solutions/web-fouc-on-boot.md) — this
          div just covers the whole viewport with the real dark background
          and the native splash mark until the app confirms it's ready to be shown.

           Inline media queries select the same system theme as the app
           before its external stylesheet loads, without a hydration race.

           Revealed by `_layout.tsx` once fonts are loaded (the same signal
          that already gates first paint of the real tree). The inline
          script below is a safety net only, in case that never fires
          (e.g. a font load error) — this must never be the thing a user
          gets stuck looking at.
        */}
        <div
          id="boot-loader"
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            data-boot-mark=""
            // A copy of the native splash image at expo-splash-screen's
            // imageWidth. It lives in public/ because +html.tsx assets
            // never reach the client bundle.
            src="/splash-icon.png"
            width={200}
            height={200}
            alt=""
          />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              setTimeout(function () {
                var el = document.getElementById("boot-loader");
                if (el) el.remove();
              }, 4000);
            `,
          }}
        />
      </body>
    </html>
  );
}
