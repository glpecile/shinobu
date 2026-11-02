import interFile from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf';
import spaceGroteskFile from '@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import satori, { init as initSatori } from 'satori/standalone';
import yogaWasm from 'satori/yoga.wasm';

import { cachedCard, parseCardPath, type Card, type OgEnv } from './og';

// wrangler's `Data` rule makes a .ttf an ArrayBuffer; src/global.d.ts types it as Metro's asset id.
const interRegular = interFile as unknown as ArrayBuffer;
const spaceGroteskBold = spaceGroteskFile as unknown as ArrayBuffer;

const WIDTH = 1200;
const HEIGHT = 630;
// The dark theme tokens in src/global.css; the card has no light variant.
const BACKGROUND = '#0a0a0a';
const FOREGROUND = '#ffffff';
const MUTED = '#aaaaaa';
const ACCENT = '#dc2626';

const SITE_CARD: Card = {
  title: 'One log. Every tracker.',
  description:
    'Log a movie, show, anime, or manga once, and Shinobu writes it to every tracker you’ve connected.',
  posters: [],
};

// Workers refuse to compile WebAssembly from bytes, so both engines get the
// module wrangler precompiled from the import.
let ready: Promise<unknown> | undefined;

/** An image as a data URI, or null when it can't be fetched as PNG or JPEG. */
async function inline(url: string, load: (url: string) => Promise<Response> = fetch): Promise<string | null> {
  try {
    const response = await load(url);
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || (type !== 'image/jpeg' && type !== 'image/png')) return null;
    return `data:${type};base64,${new Uint8Array(await response.arrayBuffer()).toBase64()}`;
  } catch {
    return null;
  }
}

function Posters({ sources }: { sources: string[] }) {
  if (sources.length === 1) {
    return <img src={sources[0]} width={334} height={502} style={{ borderRadius: 24, objectFit: 'cover' }} />;
  }
  // A fanned stack, like a list's preview row in the app.
  return (
    <div style={{ display: 'flex', position: 'relative', width: 420, height: 502 }}>
      {/* Painted back to front, so the list's first entry lands on top. */}
      {sources.toReversed().map((src, index) => (
        <img
          key={src}
          src={src}
          width={260}
          height={390}
          style={{
            position: 'absolute',
            left: index * (160 / Math.max(sources.length - 1, 1)),
            top: 56 - index * 4,
            borderRadius: 20,
            objectFit: 'cover',
            border: `4px solid ${BACKGROUND}`,
          }}
        />
      ))}
    </div>
  );
}

function CardView({ card, posters, backdrop, brand }: { card: Card; posters: string[]; backdrop: string | null; brand: string | null }) {
  // A card with no image of its own leads with the mark instead of the footer's small one.
  const leadMark = posters.length === 0 && backdrop == null ? brand : null;
  return (
    <div style={{ display: 'flex', width: WIDTH, height: HEIGHT, backgroundColor: BACKGROUND, color: FOREGROUND, fontFamily: 'Inter' }}>
      {backdrop && (
        <img src={backdrop} width={WIDTH} height={HEIGHT} style={{ position: 'absolute', objectFit: 'cover', opacity: 0.5 }} />
      )}
      {backdrop && (
        <div
          style={{
            position: 'absolute',
            width: WIDTH,
            height: HEIGHT,
            backgroundImage: `linear-gradient(90deg, ${BACKGROUND} 25%, rgba(10, 10, 10, 0.55))`,
          }}
        />
      )}
      <div style={{ display: 'flex', width: '100%', padding: 64, gap: 56 }}>
        {posters.length > 0 && <Posters sources={posters} />}
        {leadMark && <img src={leadMark} width={300} height={300} style={{ alignSelf: 'center' }} />}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {card.eyebrow && (
            <div style={{ fontFamily: 'Space Grotesk', fontSize: 26, color: ACCENT, textTransform: 'uppercase', letterSpacing: 2 }}>
              {card.eyebrow}
            </div>
          )}
          <div
            style={{
              display: 'block',
              marginTop: card.eyebrow ? 16 : 0,
              fontFamily: 'Space Grotesk',
              fontSize: card.title.length > 32 ? 60 : 76,
              lineHeight: 1.05,
              lineClamp: 3,
            }}
          >
            {card.title}
          </div>
          {card.description && (
            <div style={{ display: 'block', marginTop: 24, fontSize: 28, lineHeight: 1.4, color: MUTED, lineClamp: posters.length > 0 ? 4 : 3 }}>
              {card.description}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 'auto', paddingTop: 24 }}>
            {brand && !leadMark && <img src={brand} width={52} height={52} />}
            <div style={{ fontFamily: 'Space Grotesk', fontSize: 32 }}>Shinobu</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const timed = (url: string) => fetch(url, { signal: AbortSignal.timeout(5_000) });

/** The 1200×630 PNG for a card; an image that fails to load is left out rather than failing the card. */
async function renderCard(card: Card, loadBrand: () => Promise<string | null>): Promise<Uint8Array> {
  ready ??= Promise.all([initSatori(yogaWasm), initWasm(resvgWasm)]);
  const [, brand, backdrop, ...posters] = await Promise.all([
    ready,
    loadBrand(),
    card.backdrop ? inline(card.backdrop, timed) : null,
    ...card.posters.map((url) => inline(url, timed)),
  ]);
  const svg = await satori(
    <CardView
      card={card}
      posters={posters.filter((p): p is string => p != null)}
      backdrop={backdrop}
      brand={brand}
    />,
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: 'Inter', data: interRegular, weight: 400 },
        { name: 'Space Grotesk', data: spaceGroteskBold, weight: 700 },
      ],
    },
  );
  const renderer = new Resvg(svg);
  try {
    const image = renderer.render();
    try {
      return image.asPng();
    } finally {
      image.free();
    }
  } finally {
    renderer.free();
  }
}

export function isOgImageRequest(url: URL): boolean {
  return url.pathname.startsWith('/og/') && url.pathname.endsWith('.png');
}

/** `/og/site.png` is the default card in `+html.tsx`; `/og/<page path>.png` is that page's card. */
export async function handleOgImage(
  request: Request,
  env: OgEnv & { ASSETS: { fetch: (request: Request) => Promise<Response> } },
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  // The Cache API only keys GETs; a crawler's HEAD shares the GET's entry.
  const key = new Request(url);
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const pagePath = url.pathname.slice('/og'.length, -'.png'.length);
  let card: Card | null = SITE_CARD;
  if (pagePath !== '/site') {
    const source = parseCardPath(pagePath);
    card = source && (await cachedCard(source, new URL(pagePath, url), env, ctx));
  }
  if (card == null) return new Response('Not found', { status: 404 });
  // The splash mark comes from the asset binding: fetching our own hostname would re-enter this Worker.
  const png = await renderCard(card, () => inline(new URL('/splash-icon.png', url).href, (href) => env.ASSETS.fetch(new Request(href))));
  const response = new Response(png.slice(), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' } });
  ctx.waitUntil(caches.default.put(key, response.clone()));
  return response;
}
