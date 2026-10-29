import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { css, useReducedMotion } from 'react-native-reanimated';
// oxlint-disable-next-line no-restricted-imports -- one composed colour, see the call site.
import { useCSSVariable } from 'uniwind';

import { AnimatedView } from '@/components/animated-view';
import { Image } from '@/components/image';
import { heldKeyframes, sectionFading } from '@/components/section-enter';
import { cn } from '@/lib/cn';
import { EASE_OUT } from '@/lib/motion';
import { tmdbImageUrl } from '@/lib/providers/tmdb/config';
import { useThemeColor } from '@/lib/theme-color';

const POSTERS = [
  '/xDiXDfZwC6XYC6fxHI1jl3A3Ill.jpg', // Cowboy Bebop (1998)
  '/y2ah9t0navXyIvoHg1uIbIHO3tt.jpg', // Neon Genesis Evangelion (1995)
  '/63N9uy8nd9j7Eog2axPQ8lbr3Wj.jpg', // Blade Runner (1982)
  '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg', // Spirited Away (2001)
  '/cMYCDADoLKLbB83g4WnJegaZimC.jpg', // Princess Mononoke (1997)
  '/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg', // Alien (1979)
  '/neZ0ykEsPqxamsX6o5QNUFILQrz.jpg', // Akira (1988)
  '/9gC88zYUBARRSThcG93MvW14sqx.jpg', // Ghost in the Shell (1995)
  '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', // The Godfather (1972)
  '/3MQo7PPuntw8GaZrsBPZcJLJity.jpg', // Serial Experiments Lain (1998)
  '/lYpHeSm7BcUxAbBx1ucuEH7oGAe.jpg', // Samurai Champloo (2004)
  '/ve72VxNqjGM69Uky4WTo2bK6rfq.jpg', // 2001: A Space Odyssey (1968)
  '/6WTiOCfDPP8XV4jqfloiVWf7KHq.jpg', // Perfect Blue (1998)
  '/nHJljo2Pi7XimYEgV9hvRchQWmg.jpg', // Paprika (2006)
  '/lOMGc8bnSwQhS4XyE1S99uH8NXf.jpg', // Seven Samurai (1954)
  '/41XxSsJc5OrulP0m7TrrUeO2hoz.jpg', // Castle in the Sky (1986)
  '/rtGDOeG9LzoerkDGZF9dnVeLppL.jpg', // My Neighbor Totoro (1988)
  '/dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg', // The Matrix (1999)
  '/lwLFZFB3S2PeOLtWksaWerF6B4D.jpg', // Trigun (1998)
  '/FkgA8CcmiLJGVCRYRQ2g2UfVtF.jpg', // FLCL (2000)
  '/lGCEKlJo2CnWydQj7aamY7s1S7Q.jpg', // Casablanca (1943)
  '/yUkH0y9OsY7J08Dvfzi1P0di559.jpg', // Redline (2009)
  '/onCLyCOgszTIyyVs2XKYSkKPOPG.jpg', // Dragon Ball (1986)
  '/d9mtMGQDLANKieb9PbD3yK7xxzo.jpg', // Jurassic Park (1993)
  '/1qhOyf5C4s9ZdvY8d5JDx9DFMeT.jpg', // Stalker (1979)
  '/8BgGbbWiLNhPtkMkN0gGTnbtvBv.jpg', // In the Mood for Love (2000)
  '/x7A59t6ySylr1L7aubOQEA480vM.jpg', // Mulholland Drive (2001)
  '/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg', // Pulp Fiction (1994)
  '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', // Parasite (2019)
  '/pWDtjs568ZfOTMbURQBYuT4Qxka.jpg', // Oldboy (2003)
  '/15uOEfqBNTVtDUT7hGBVCka0rZz.jpg', // Vertigo (1958)
  '/gQB8Y5RCMkv2zwzFHbUJX3kAhvA.jpg', // Apocalypse Now (1979)
  '/ekstpH614fwDX8DUln1a2Opz0N8.jpg', // Taxi Driver (1976)
  '/nSxDa3M9aMvGVLoItzWTepQ5h5d.jpg', // Amélie (2001)
  '/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg', // Spider-Man: Into the Spider-Verse (2018)
  '/ulcAi4dKpAjHwYGS08vNyx9H6I9.jpg', // Mad Max: Fury Road (2015)
  '/vfJFJPepRKapMd5G2ro7klIRysq.jpg', // Your Name. (2016)
  '/13kOl2v0nD2OLbVSHnHk8GUFEhO.jpg', // Howl's Moving Castle (2004)
  '/k9tv1rXZbOhH7eiCk378x61kNQ1.jpg', // Grave of the Fireflies (1988)
  '/tzGY49kseSE9QAKk47uuDGwnSCu.jpg', // The Thing (1982)
  '/43I9DcNoCzpyzK8JCkJYpHqHqGG.jpg', // Chungking Express (1994)
  '/ijWibsAU1iBcCD8tuIZfTmDzMVE.jpg', // Rashomon (1950)
  '/uAR0AWqhQL1hQa69UDEbb2rE5Wx.jpg', // The Shining (1980)
  '/cQidJuA546OSSXKWXoiCeINDxuj.jpg', // The Tale of the Princess Kaguya (2013)
  '/qzZEnaXwv4wss2QalEo4Uf9BAwh.jpg', // Ninja Scroll (1993)
  '/1EdA21TRBXJU5aBP4EHkOMF2tNx.jpg', // Mushishi (2005)
  '/n5XNKXnoXpoXyfiCtXHOf8q8PFM.jpg', // Monster (2004)
  '/lA9CNSdo50iQPZ8A2fyVpMvJZAf.jpg', // Twin Peaks (1990)
  '/5ZFUEOULaVml7pQuXxhpR2SmVUw.jpg', // Fullmetal Alchemist: Brotherhood (2009)
  '/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg', // Attack on Titan (2013)
  '/vR7hwaGQ0ySRoq1WobiNRaPs4WO.jpg', // Mob Psycho 100 (2016)
  '/dqZENchTd7lp5zht7BdlqM7RBhD.jpg', // Frieren: Beyond Journey's End (2023)
  '/rTc7ZXdroqjkKivFPvCPX0Ru7uw.jpg', // The Sopranos (1999)
  '/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg', // Breaking Bad (2008)
  '/i2EEr2uBvRlAwJ8d8zTG2Y19mIa.jpg', // Hunter x Hunter (2011)
  '/tHcce6PKnhNBneSMbadI4jynHpY.jpg', // Ergo Proxy (2006)
  '/cQ6YiBTUlsKGm2mWa7mE9eZnlS2.jpg', // Paranoia Agent (2004)
  '/a3VW6khsyUVKrG0GBCWFG3NzWPX.jpg', // Fargo (2014)
  '/2pQ9xfgDa3L3QpoXfkNhISby2R4.jpg', // Devilman Crybaby (2018)
  '/npdB6eFzizki0WaZ1OvKcJrWe97.jpg', // Chainsaw Man (2022)
].map((path) => tmdbImageUrl(path, 'w342'));

/** Directors, actors, composers, and crew behind the titles above. */
const PEOPLE = [
  '/ouhjt9KugzhWtdEyBPipihB3ic8.jpg', // Hayao Miyazaki
  '/b7Oqg1bjS0e2iEzEjYWnsyVVagt.jpg', // Satoshi Kon
  '/ca8fRqLDfTJTCamLKHp70up23ET.jpg', // Akira Kurosawa
  '/yFT0VyIelI9aegZrsAwOG5iVP4v.jpg', // Stanley Kubrick
  '/zABJmN9opmqD4orWl3KSdCaSo7Q.jpg', // Ridley Scott
  '/wTSnfktNBLd6kwQxgvkqYw6vEon.jpg', // Sigourney Weaver
  '/8RZLOyYGsoRe9p44q3xin9QkMHv.jpg', // Keanu Reeves
  '/cZ5ybA7cDA0EBMaM5jX2f7RNBVb.jpg', // Toshirō Mifune
  '/yIvLpf9U9NfAvC7fuAgOQ8tu51T.jpg', // Marlon Brando
  '/jXEE0P6705JbMAJ2nwtHjmqkd5F.jpg', // Ingrid Bergman
  '/4pk2VbOb2td7iBZyir6Ji46HH4N.jpg', // Humphrey Bogart
  '/xmDT8LoDPIyV4f7Q2yPwETSey6k.jpg', // Joe Hisaishi
  '/6ArCsK3oHUMvJF4KJNw9HglttFt.jpg', // Yoko Kanno
  '/AptCCXOt0n4pnTjvFau8GtFyysh.jpg', // Shinichiro Watanabe
  '/zKno06IDV6PIa8oUI9RmToVIPPC.jpg', // Mamoru Oshii
  '/hMxQlQa0cKLx086va8KDIyOdxO1.jpg', // Katsuhiro Otomo
  '/AfV9h1RW6uALpx751APdUoX8ONc.jpg', // Hideaki Anno
  '/qbvnGLByh0N9ni7gZSREIgvO1sM.jpg', // Isao Takahata
  '/yjtamGYg7n8H3lApDxTw6bja9ZR.jpg', // Wong Kar-wai
  '/idGzkwbm0BiLdrrKfcXecFNXbDu.jpg', // Tony Leung Chiu-wai
  '/wwBzRDoIW6Ld64h6OkQ6ImCZKsR.jpg', // David Lynch
  '/stwnTvZAoD8gEJEDHpDQyLCyDy5.jpg', // Bong Joon Ho
  '/kBM9UTPYXUA2RNk210DXhztLFns.jpg', // Song Kang-ho
  '/aXnFLmz9EaRCt93uEXns8WVPmSG.jpg', // Agnès Varda
  '/mytn9s5kc6CqzKZtbuJ73oA6ujy.jpg', // Andrei Tarkovsky
  '/3Pblihd6KjXliie9vj4iQJwbNPU.jpg', // Francis Ford Coppola
  '/m8HAAjq1T75JypKk0v1FFQn4ysZ.jpg', // Al Pacino
  '/cT8htcckIuyI1Lqwt1CvD02ynTh.jpg', // Robert De Niro
  '/g3DjfKsgZQWZiw30I20hZVk1oMX.jpg', // Martin Scorsese
  '/y6tSqoDvl705BnLELyCuUqQujfv.jpg', // Roger Deakins
  '/yTJKHAjLrd0XtCjnfIXOCMMgZnZ.jpg', // Thelma Schoonmaker
  '/tpQnDeHY15szIXvpnhlprufz4d.jpg', // Hans Zimmer
  '/AnItysU3XsiUpAuBN7gpA1R2aNl.jpg', // Ennio Morricone
  '/3Alm4pmBIxpeeh0Sdippxdbkpne.jpg', // Megumi Hayashibara
  '/uH9oiqOOgrsz2zNnouVZ1qPzDyb.jpg', // Akio Otsuka
  '/lv4UuorZtC37VaFAHO205u4lS73.jpg', // Rinko Kikuchi
  '/AsX4bdvZ8UCayWTmAf9lAqOA8V7.jpg', // Mads Mikkelsen
  '/dzjT4LKgs7eOma84GsPy78DsGNH.jpg', // Tilda Swinton
  '/gV1lO7MjMso31nQ9NiLGtsdSYgZ.jpg', // Hiroyuki Sawano
  '/c8w5a2ExhnRPV3lN4D2CvOwGQJT.jpg', // Masaaki Yuasa
  '/z8TN4Nkmhem6XqcnH2jMn5Ayf97.jpg', // Makoto Shinkai
  '/dxKAhpkz4XNwmRzMG5QOpXjPZ1N.jpg', // Greta Gerwig
  '/xzQYqb4nR8xT7Zdw5itbEL9K3fd.jpg', // Denis Villeneuve
  '/gd7ShD0yt4bsR2STeQ19KQ6hvXL.jpg', // Charlize Theron
  '/tZxcg19YQ3e8fJ0pOs7hjlnmmr6.jpg', // Steven Spielberg
  '/wswitHP5jQNvsIxd6Yypa1Crmn1.jpg', // John Williams
].map((path) => tmdbImageUrl(path, 'w342'));

/** Transparent logos, tinted to the foreground since most are drawn in black. */
const STUDIOS = [
  '/uFuxPEZRUcBTEiYIxjHJq62Vr77.png', // Studio Ghibli
  '/9k0nr75nwnNeT2MHerf1OXJN0hj.png', // Madhouse
  '/yKZ9UarLSu9Y4Gpw33nKRQOPM7z.png', // Sunrise
  '/Kig8mkbWVSvHfC8MWc1fc4zJfZ.png', // Production I.G
  '/j9VqEdiNqIkMJKku1UTGMAvmuRr.png', // Gainax
  '/cN3JNIKawjOMtfk0GBVIbsx69bg.png', // Bones
  '/wSejGn3lAZdQ5muByxvzigwyDY6.png', // MAPPA
  '/leZ8GPCL0GneHHayPVnXtB3p0We.png', // Kyoto Animation
  '/hr0hVCU1w91AgqAxbwzGuDUOjm2.png', // Toei Animation
  '/g96SufLc3lXtaU73tAvEbTbXymY.png', // Trigger
  '/u7nsZM0vmBMDpzIy27164AwMjXV.png', // A24
  '/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png', // Pixar
  '/zhD3hhtKB5qyv7ZeL4uLpNxgMVU.png', // Warner Bros. Pictures
  '/fRSWWjquvzcHjACbtF53utZFIll.png', // Toho
  '/8lvHyhjr8oUKOOy2dKXoALWKdp0.png', // Universal Pictures
  '/tlVSws0RvvtPBwViUyOFAO0vcQS.png', // Lucasfilm
  '/wTPPnz05ZCQgEQVeSOxTkUCyhr5.png', // Pierrot
  '/1vwZPG0zMVRvThCY8Lljh0ppxQo.png', // Wit Studio
  '/fpUFQKvrWPWTA8lbLWtWX65miPS.png', // Science SARU
  '/l96PFbGQ8kUs030SrkYdK4LQklE.png', // Shaft
  '/kaKA5gYb9f1w5WOn4TJMvsBC83d.png', // The Criterion Collection
  '/3K9wCZTyDgop3ITK1rDi6T2PckE.png', // Neon
  '/cEaxANEisCqeEoRvODv2dO1I0iI.png', // Amblin Entertainment
  '/nM2MfoMqzJQRiSynsDabOtFKetD.png', // 20th Century Fox
  '/usUnaYV6hQnlVAXP6r4HwrlLFPG.png', // Metro-Goldwyn-Mayer
  '/71BqEFAF4V3qjjMPCpLuyJFB9A.png', // Columbia Pictures
  '/tuomPhY2UtuPTqqFnKMVHvSb724.png', // HBO
  '/rDYExnBV61jGQnkhVVrPN4Yl7O1.png', // Aniplex
  '/kZvTniBgpTzAThHCa0OZ1FJtRjy.png', // CloverWorks
  '/9779IFPDaVxYmmWOHHfRyH17qnx.png', // Studio 4°C
  '/AgCkAk8EpUG9fTmK6mWcaJA2Zwh.png', // Laika
  '/8ixoR3cvroUqNDLjaX6AZmJIdRY.png', // Aardman
  '/uneZYGxTZcwAzmPTTaefmDNWPzN.png', // Cartoon Saloon
  '/93eAKlnQecDdMtucfOprzcjMw9V.png', // Shochiku
  '/xnFIOeq5cKw09kCWqV7foWDe4AA.png', // Focus Features
  '/eplqXZD7BVDvu4E2QyKRFkL7rtJ.png', // Annapurna
  '/2ycs64eqV5rqKYHyQK0GVoKGvfX.png', // New Line Cinema
  '/stBqzj4Nr7l49ww6xiSRWjbpHkn.png', // Walt Disney Animation
].map((path) => tmdbImageUrl(path, 'w300'));

const WALLS = { titles: POSTERS, people: PEOPLE, studios: STUDIOS };
type WallSubject = keyof typeof WALLS;

function subscribeNever() {
  return () => {};
}

/**
 * Each column repeats its set three times and drifts by one set's height, so
 * the loop is seamless and a tall window never sees the column's end. Logo
 * tiles are shorter, so their columns hold more to cover the same height.
 */
function tile(width: number, height: number, gap: number, perColumn: number) {
  return {
    width,
    height,
    gap,
    perColumn,
    drift: css.keyframes({
      from: { transform: [{ translateY: 0 }] },
      to: { transform: [{ translateY: -perColumn * (height + gap) }] },
    }),
  };
}
const POSTER_TILES = { compact: tile(112, 168, 10, 6), wide: tile(140, 210, 12, 6) };
const LOGO_TILES = { compact: tile(112, 76, 10, 12), wide: tile(140, 96, 12, 12) };

function shuffled<T>(items: readonly T[]): T[] {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Deals each column from a shuffled deck, reshuffling when it runs out, so a
 * wide window doesn't repeat whole columns. A column never repeats an image
 * or shares one with its left neighbour; every pool holds over two columns' worth.
 */
function deal(images: readonly string[], columns: number, perColumn: number): string[][] {
  const sets: string[][] = [];
  let deck: string[] = [];
  for (let column = 0; column < columns; column++) {
    const set: string[] = [];
    const previous = sets[column - 1] ?? [];
    while (set.length < perColumn) {
      const index = deck.findIndex((uri) => !set.includes(uri) && !previous.includes(uri));
      if (index === -1) {
        deck = [...deck, ...shuffled(images)];
        continue;
      }
      set.push(...deck.splice(index, 1));
    }
    sets.push(set);
  }
  return sets;
}

/** The wall's tiles rise in column by column; each poster cross-fades in as it loads. */
const ENTER_DURATION = 700;
const ENTER_STAGGER = 60;
const ENTER_RISE = 24;
const wallEntering = {
  '0%': { opacity: 0, transform: [{ translateY: ENTER_RISE }] },
  '100%': { opacity: 1, transform: [{ translateY: 0 }] },
};

/** Per-column start offset (in posters) and loop length, so no two neighbours move in step. */
const COLUMN_RHYTHM = [
  { offset: 0, duration: 80_000 },
  { offset: 0.55, duration: 95_000 },
  { offset: 0.2, duration: 85_000 },
  { offset: 0.8, duration: 82_000 },
  { offset: 0.35, duration: 105_000 },
  { offset: 0.65, duration: 100_000 },
  { offset: 0.1, duration: 90_000 },
];

/**
 * A drifting, tilted wall behind a first-run or idle screen: titles on Home,
 * people or studio logos on Search. Fixed picks of classic film and anime keep
 * it out of release-week trends; each mount deals them in a new order.
 */
export function PosterWall({ subject = 'titles' }: { subject?: WallSubject }) {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const { width, height } = useWindowDimensions();
  const focused = useIsFocused();
  const reduceMotion = useReducedMotion();
  // The column under a hovering pointer holds still so its posters can be read.
  const [hovered, setHovered] = useState<number | null>(null);
  // `useCSSVariable`, not `useThemeColor`: the fade composes a transparent stop
  // (`${background}00`), which web's `var(--token)` can't. Wait for hydration
  // so the wall and this colour are client-only
  // (docs/solutions/web-prerender-bakes-js-resolved-colors.md).
  const background = useCSSVariable('--color-background');
  const foreground = useThemeColor('--color-foreground');

  const wide = width >= 768;
  const logos = subject === 'studios';
  const size = (logos ? LOGO_TILES : POSTER_TILES)[wide ? 'wide' : 'compact'];
  // The tilt pulls the corners inward, so the wall is half again as wide as the screen.
  const columns = Math.ceil((width * 1.5) / (size.width + size.gap));
  // Re-deal only when the layout changes, not on every hover.
  const dealtFor = `${subject}:${columns}:${size.perColumn}`;
  const [dealt, setDealt] = useState(() => ({
    key: dealtFor,
    sets: deal(WALLS[subject], columns, size.perColumn),
  }));
  if (dealt.key !== dealtFor) {
    setDealt({ key: dealtFor, sets: deal(WALLS[subject], columns, size.perColumn) });
  }
  if (!hydrated || typeof background !== 'string') return null;

  return (
    <View
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{ pointerEvents: 'box-none' }}
    >
      <View
        className="absolute flex-row justify-center opacity-50"
        style={{
          gap: size.gap,
          left: -width / 4,
          right: -width / 4,
          top: -size.height,
          transform: [{ rotate: '-8deg' }],
          // Pivot on the viewport's centre, not the far taller row's, or the tilt
          // slides the visible stretch sideways and bares one edge.
          transformOrigin: `50% ${height / 2 + size.height}px`,
        }}
      >
        {dealt.sets.map((set, column) => {
          const rhythm = COLUMN_RHYTHM[column % COLUMN_RHYTHM.length];
          return (
            <AnimatedView
              key={column}
              onPointerEnter={() => setHovered(column)}
              onPointerLeave={() => setHovered((current) => (current === column ? null : current))}
              style={{
                marginTop: -rhythm.offset * (size.height + size.gap),
                // Search remounts this wall when a typed query clears.
                animationName: subject === 'titles' ? heldKeyframes(
                  reduceMotion ? sectionFading : wallEntering,
                  column * ENTER_STAGGER,
                  ENTER_DURATION,
                ) : undefined,
                animationDuration: ENTER_DURATION + column * ENTER_STAGGER,
                animationTimingFunction: EASE_OUT,
              }}
            >
              <AnimatedView
                style={{
                  gap: size.gap,
                  animationName: reduceMotion ? undefined : size.drift,
                  animationDuration: rhythm.duration,
                  animationTimingFunction: 'linear',
                  animationIterationCount: 'infinite',
                  animationDirection: column % 2 === 0 ? 'normal' : 'reverse',
                  animationPlayState: focused && hovered !== column ? 'running' : 'paused',
                }}
              >
                {[...set, ...set, ...set].map((uri, index) => (
                  // Index keys: the repeated set repeats every uri by design.
                  <View
                    className={cn('rounded-lg overflow-hidden bg-surface', logos && 'p-4 border border-border')}
                    key={index}
                    style={{ width: size.width, height: size.height }}
                  >
                    <Image
                      className="w-full h-full"
                      contentFit={logos ? 'contain' : 'cover'}
                      source={{ uri }}
                      {...(logos && foreground != null ? { tintColor: foreground } : {})}
                    />
                  </View>
                ))}
              </AnimatedView>
            </AnimatedView>
          );
        })}
      </View>
      <LinearGradient
        colors={[`${background}33`, `${background}B3`, background]}
        end={wide ? { x: 0, y: 0.5 } : { x: 0.5, y: 1 }}
        locations={wide ? [0.25, 0.5, 0.62] : [0, 0.45, 0.68]}
        start={wide ? { x: 1, y: 0.5 } : { x: 0.5, y: 0 }}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
    </View>
  );
}
