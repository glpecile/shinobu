import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Fragment, type ComponentProps, type ReactNode } from 'react';
import { Text } from 'react-native';

import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';

/**
 * "📅 2026 · 🕒 109 min · 🏷 Drama" — the parts that exist, joined by " · ". Nothing
 * when every part is missing.
 *
 * ```tsx
 * <MetaLine className="mt-1.5" parts={[year, runtime != null && <MetaLine.Part icon="time-outline">{`${runtime} min`}</MetaLine.Part>]} />
 * ```
 */
export function MetaLine({
  parts,
  align = 'left',
  className,
}: {
  parts: ReactNode[];
  align?: 'left' | 'center';
  className?: string;
}) {
  const shown = parts.filter((part) => part != null && part !== false && part !== '');
  if (shown.length === 0) return null;
  return (
    <Text className={cn('text-muted font-sans text-sm', align === 'center' && 'text-center', className)}>
      {shown.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && ' · '}
          {part}
        </Fragment>
      ))}
    </Text>
  );
}

/** One part with its icon: `calendar-outline` for dates, `time-outline` for runtime, `pricetags-outline` for genres. */
function Part({ icon, children }: { icon: ComponentProps<typeof Ionicons>['name']; children: string }) {
  const muted = useThemeColor('--color-muted');
  return (
    <>
      <Ionicons accessible={false} color={muted} name={icon} size={14} /> {children}
    </>
  );
}

MetaLine.Part = Part;
