import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Fragment, type ComponentProps, type ReactNode } from 'react';
import { Text } from 'react-native';

import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';

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
    <Text
      className={cn('text-muted font-sans text-sm', align === 'center' && 'text-center', className)}
    >
      {shown.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && '\u00A0· '}
          {part}
        </Fragment>
      ))}
    </Text>
  );
}

function Part({
  icon,
  children,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  children: string;
}) {
  const muted = useThemeColor('--color-muted');
  return (
    <>
      <Ionicons accessible={false} color={muted} name={icon} size={14} />
      {`\u00A0${children}`}
    </>
  );
}

MetaLine.Part = Part;
