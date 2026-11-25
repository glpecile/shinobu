import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";

import { SHINOBU_WEB_DOMAIN } from "@/lib/config";
import { fontFaceCss, preloadedFonts } from "@/lib/fonts/web-faces";

const SITE_DESCRIPTION =
  "Log a movie, show, anime, or manga once, and Shinobu writes it to every tracker you've connected.";

export default function Root({ children }: { children: React.ReactNode }) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } =
    useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* Android browsers otherwise overlay the keyboard on the layout viewport (iOS Safari ignores this). */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, interactive-widget=resizes-content"
        />

        <ScrollViewStyleReset />

        {/* Critical background CSS closes the FOUC window before Uniwind's stylesheet loads (docs/solutions/web-fouc-on-boot.md). */}
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
              html.dark, html.dark body, html.dark #boot-loader {
                background-color: #0a0a0a;
                color: #0a0a0a;
              }
              html.light, html.light body, html.light #boot-loader {
                background-color: #ffffff;
                color: #ffffff;
              }
            `,
          }}
        />
        {/* Uniwind adopts an existing html theme class on load; MMKV stores web keys as "<id>\<key>". */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem("prefs\\\\theme");
                if (theme === "light" || theme === "dark") {
                  document.documentElement.classList.add(theme);
                  document.documentElement.style.colorScheme = theme;
                }
              } catch (e) {}
            `,
          }}
        />

        {headNodes}

        {preloadedFonts.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="" />
        ))}
        <style dangerouslySetInnerHTML={{ __html: fontFaceCss }} />

        <meta property="og:site_name" content="Shinobu" />
        <meta property="og:type" content="website" />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:image" content={`${SHINOBU_WEB_DOMAIN}/og/site.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}

        {/* Sibling of #root so React hydration doesn't touch it; covers FOUC until fonts load (docs/solutions/web-fouc-on-boot.md). */}
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
            // Lives in public/ because +html.tsx assets aren't bundled.
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
