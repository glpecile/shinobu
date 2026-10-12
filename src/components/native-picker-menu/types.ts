import type { ReactNode } from 'react';

export interface NativePickerMenuProps<T extends string | number | null> {
  title: string;
  value: T;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onSelect: (value: T) => void;
  children: ReactNode;
}
