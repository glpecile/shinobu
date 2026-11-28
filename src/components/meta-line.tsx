import { Text } from 'react-native';

import { cn } from '@/lib/cn';

export function MetaLine({
  parts,
  align = 'left',
  className,
}: {
  parts: (string | null | undefined | false)[];
  align?: 'left' | 'center';
  className?: string;
}) {
  const shown = parts.filter((part) => part != null && part !== false && part !== '');
  if (shown.length === 0) return null;
  return (
    <Text
      className={cn('text-muted font-sans text-sm', align === 'center' && 'text-center', className)}
    >
      {shown.join('\u00A0· ')}
    </Text>
  );
}
