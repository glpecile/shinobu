import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';
import { css, useReducedMotion } from 'react-native-reanimated';
// oxlint-disable-next-line no-restricted-imports -- one composed colour, see the call site.
import { useCSSVariable } from 'uniwind';

import { AnimatedView } from '@/components/animated-view';
import { Image } from '@/components/image';
import { heldKeyframes } from '@/components/section-enter';
import { EASE_OUT } from '@/lib/motion';
import { useTrendingMoviesQuery } from '@/state/queries/use-unified-feed';

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

/** The wall rises in column by column when the posters arrive, masking their scattered loads. */
const ENTER_DURATION = 700;
const ENTER_STAGGER = 60;
const ENTER_RISE = 24;
const wallEntering = {
  '0%': { opacity: 0, transform: [{ translateY: ENTER_RISE }] },
  '100%': { opacity: 1, transform: [{ translateY: 0 }] },
};
/** Reduced motion keeps the fade and drops the travel. */
const wallFading = { '0%': { opacity: 0 }, '100%': { opacity: 1 } };

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
 * The zero-providers Home backdrop: Simkl's public trending posters (bundled
 * client id, no session), shown once loaded and drifting in tilted columns under a fade to the page
 * background. Decoration only, so it is hidden from touch and screen readers,
 * paused while Home is a background tab, and still under reduced motion.
 */
export function PosterWall() {
  const { data } = useTrendingMoviesQuery();
  const { width } = useWindowDimensions();
  const focused = useIsFocused();
  const reduceMotion = useReducedMotion();
  // `useCSSVariable`, not `useThemeColor`: the fade composes a transparent stop
  // (`${background}00`), which web's `var(--token)` can't. The query never
  // resolves during prerender, so the wall and this colour are client-only
  // (docs/solutions/web-prerender-bakes-js-resolved-colors.md).
  const backgroundVariable = useCSSVariable('--color-background');
  const background = typeof backgroundVariable === 'string' ? backgroundVariable : undefined;

  const wide = width >= 768;
  const size = wide ? WIDE : COMPACT;
  // The tilt pulls the corners inward, so the wall is half again as wide as the screen.
  const columns = Math.ceil((width * 1.5) / (size.width + size.gap));
  const posters = (data ?? []).map((item) => item.coverImage).filter((uri) => uri !== '');
  if (posters.length === 0 || background == null) return null;

  return (
    <View
      accessibilityElementsHidden
      className="absolute inset-0 overflow-hidden"
      importantForAccessibility="no-hide-descendants"
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
            (_poster, row) => posters[(column * PER_COLUMN + row) % posters.length],
          );
            const rhythm = COLUMN_RHYTHM[column % COLUMN_RHYTHM.length];
            return (
              <AnimatedView
                key={column}
                style={{
                  marginTop: -rhythm.offset * (size.height + size.gap),
                  animationName: heldKeyframes(
                    reduceMotion ? wallFading : wallEntering,
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
