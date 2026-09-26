import { SegmentedControl, type SegmentedControlProps } from '@/components/segmented-control';

/** Shared animated season and format controls outside iOS's native picker. */
export function SeasonTabs<T extends string>(props: SegmentedControlProps<T>) {
  return <SegmentedControl {...props} tone="accent" />;
}
