import { SegmentedControl, type SegmentedControlProps } from '@/components/segmented-control';

export function NativeSegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  return <SegmentedControl {...props} tone="accent" />;
}
