import { useState } from 'react';
import { Text, View } from 'react-native';
import { FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { AnimatedText } from '@/components/animated-view';
import { DURATION } from '@/lib/motion';

import { initialRun, morphRun } from './morph-keys';

/** Mirrors index.web.tsx — keep both platform variants' props identical. */
export interface MorphTextProps {
  /** The current text — a change morphs in place. */
  children: string | number;
  className?: string;
  /** Line cap, as on `Text`; setting it opts out of the morph (see below). */
  numberOfLines?: number;
}

const GLYPH_ENTER = FadeIn.duration(DURATION.swap);
const GLYPH_EXIT = FadeOut.duration(DURATION.exit);
const GLYPH_SLIDE = LinearTransition.duration(DURATION.swap);

/**
 * Native counterpart of torph: one `Text` per character, keyed by a diff
 * against the previous text, so a character that survives the change slides
 * to its new slot and the rest crossfade. The first render never animates.
 *
 * A row of glyphs can't wrap or ellipsize, so `numberOfLines` (and reduced
 * motion) renders a plain `Text` swap instead. Per-glyph nodes also drop
 * kerning pairs; at label sizes that's invisible.
 */
export function MorphText({ children, className, numberOfLines }: MorphTextProps) {
  const text = String(children);
  const reduceMotion = useReducedMotion();
  const [run, setRun] = useState(() => initialRun(text));
  // Keys below this were on screen at mount; only later glyphs enter.
  const [mountedKeys] = useState(run.nextKey);
  if (run.text !== text) setRun(morphRun(run, text));

  if (reduceMotion || numberOfLines != null) {
    return (
      <Text className={className} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  return (
    <View accessible accessibilityLabel={text} className="flex-row">
      {run.glyphs.map((glyph) => (
        <AnimatedText
          key={glyph.key}
          className={className}
          entering={glyph.key >= mountedKeys ? GLYPH_ENTER : undefined}
          exiting={GLYPH_EXIT}
          layout={GLYPH_SLIDE}
        >
          {glyph.char}
        </AnimatedText>
      ))}
    </View>
  );
}
