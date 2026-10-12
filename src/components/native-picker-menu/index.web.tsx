import type { NativePickerMenuProps } from './types';

/** Web triggers continue to open their app sheets. */
export function NativePickerMenu<T extends string | number | null>({
  children,
}: NativePickerMenuProps<T>) {
  return <>{children}</>;
}
