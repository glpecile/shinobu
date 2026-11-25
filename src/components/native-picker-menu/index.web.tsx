import type { NativePickerMenuProps } from './types';

export function NativePickerMenu<T extends string | number | null>({
  children,
}: NativePickerMenuProps<T>) {
  return <>{children}</>;
}
