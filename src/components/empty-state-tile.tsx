import type { ReactNode } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';

/**
 * The shared empty-state tile — icon + headline + optional body + optional CTA
 * (plan 0016 R9). Sized for embedding inside a list (the diary's connect /
 * degraded / no-logs states) but with a `size="hero"` variant the Home
 * zero-providers screen adopts too, so there is one empty-state component
 * instead of bespoke markup per screen. Theme tokens only.
 */
export interface EmptyStateTileProps {
  /** Rendered above the headline (a provider glyph, an Ionicon, the 忍 mark). */
  icon?: ReactNode;
  title: string;
  description?: string;
  cta?: { label: string; onPress: () => void };
  /** Extra content between the description and the CTA (e.g. an error line). */
  children?: ReactNode;
  /** 'inline' (default, in-list) or 'hero' (full-screen Home). */
  size?: 'inline' | 'hero';
  className?: string;
}

export function EmptyStateTile({
  icon,
  title,
  description,
  cta,
  children,
  size = 'inline',
  className,
}: EmptyStateTileProps) {
  const hero = size === 'hero';
  const { width } = useWindowDimensions();
  const compact = width < 640;
  // The hero headline stays the screen-filling display tagline (large on wide
  // viewports, dialed back on phones); the inline variant is a modest tile.
  const titleSize = hero ? (compact ? 'text-4xl' : 'text-6xl') : 'text-xl';

  return (
    <View className={`items-center justify-center px-8 ${className ?? ''}`}>
      {icon != null && <View className={hero ? 'mb-6' : 'mb-3'}>{icon}</View>}
      <Text
        className={`font-display text-foreground text-center tracking-tight ${titleSize}`}
      >
        {title}
      </Text>
      {description != null && (
        <Text
          className={`font-sans text-muted text-center leading-relaxed ${
            hero
              ? `text-base mt-5 ${compact ? 'max-w-xs' : 'max-w-md'}`
              : 'text-sm mt-2 max-w-xs'
          }`}
        >
          {description}
        </Text>
      )}
      {children}
      {cta != null && (
        <PresstableOpacity
          className={`bg-accent rounded ${hero ? 'px-8 py-3 mt-8' : 'px-6 py-2.5 mt-5'}`}
          onPress={cta.onPress}
        >
          <Text
            className={`text-accent-foreground font-sans-semibold text-center ${
              hero ? 'text-base' : 'text-sm'
            }`}
          >
            {cta.label}
          </Text>
        </PresstableOpacity>
      )}
    </View>
  );
}
