import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { css, useReducedMotion } from 'react-native-reanimated';
// oxlint-disable-next-line no-restricted-imports -- one composed colour, see the call site.
import { useCSSVariable } from 'uniwind';

import { AnimatedView } from '@/components/animated-view';
import { Image } from '@/components/image';
import { heldKeyframes, sectionFading } from '@/components/section-enter';
import { EASE_OUT } from '@/lib/motion';
import { tmdbImageUrl } from '@/lib/providers/tmdb/config';

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
].map((path) => tmdbImageUrl(path, 'w342'));

function subscribeNever() {
  return () => {};
}

const PER_COLUMN = 6;
const COMPACT = { width: 112, height: 168, gap: 10 };
const WIDE = { width: 140, height: 210, gap: 12 };

/**
 * Each column repeats its set three times and drifts by one set's height, so
 * the loop is seamless and a tall window never sees the column's end.
 */
const driftBy = (size: typeof COMPACT) =>
  css.keyframes({
    from: { transform: [{ translateY: 0 }] },
    to: { transform: [{ translateY: -PER_COLUMN * (size.height + size.gap) }] },
  });
const COMPACT_DRIFT = driftBy(COMPACT);
const WIDE_DRIFT = driftBy(WIDE);

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

/** A fixed mix of classic films and anime keeps the welcome wall out of release-week trends. */
export function PosterWall() {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const { width } = useWindowDimensions();
  const focused = useIsFocused();
  const reduceMotion = useReducedMotion();
  // `useCSSVariable`, not `useThemeColor`: the fade composes a transparent stop
  // (`${background}00`), which web's `var(--token)` can't. Wait for hydration
  // so the wall and this colour are client-only
  // (docs/solutions/web-prerender-bakes-js-resolved-colors.md).
  const background = useCSSVariable('--color-background');

  const wide = width >= 768;
  const size = wide ? WIDE : COMPACT;
  // The tilt pulls the corners inward, so the wall is half again as wide as the screen.
  const columns = Math.ceil((width * 1.5) / (size.width + size.gap));
  if (!hydrated || typeof background !== 'string') return null;

  return (
    <View
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{ pointerEvents: 'none' }}
    >
      <View
        className="absolute flex-row justify-center opacity-50"
        style={{
          gap: size.gap,
          left: -width / 4,
          right: -width / 4,
          top: -size.height,
          transform: [{ rotate: '-8deg' }],
        }}
      >
        {Array.from({ length: columns }, (_, column) => {
          const set = Array.from(
            { length: PER_COLUMN },
            (_poster, row) => POSTERS[(column * PER_COLUMN + row) % POSTERS.length],
          );
          const rhythm = COLUMN_RHYTHM[column % COLUMN_RHYTHM.length];
          return (
            <AnimatedView
              key={column}
              style={{
                marginTop: -rhythm.offset * (size.height + size.gap),
                animationName: heldKeyframes(
                  reduceMotion ? sectionFading : wallEntering,
                  column * ENTER_STAGGER,
                  ENTER_DURATION,
                ),
                animationDuration: ENTER_DURATION + column * ENTER_STAGGER,
                animationTimingFunction: EASE_OUT,
              }}
            >
              <AnimatedView
                style={{
                  gap: size.gap,
                  animationName: reduceMotion ? undefined : wide ? WIDE_DRIFT : COMPACT_DRIFT,
                  animationDuration: rhythm.duration,
                  animationTimingFunction: 'linear',
                  animationIterationCount: 'infinite',
                  animationDirection: column % 2 === 0 ? 'normal' : 'reverse',
                  animationPlayState: focused ? 'running' : 'paused',
                }}
              >
                {[...set, ...set, ...set].map((uri, index) => (
                  // Index keys: the repeated set repeats every uri by design.
                  <View
                    className="rounded-lg overflow-hidden bg-surface"
                    key={index}
                    style={{ width: size.width, height: size.height }}
                  >
                    <Image className="w-full h-full" contentFit="cover" source={{ uri }} />
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
        style={{ position: 'absolute', inset: 0 }}
      />
    </View>
  );
}
