import { SegmentedControl, type SegmentedControlProps } from '@/components/segmented-control';

/** Web uses the shared animated control; native platforms use system controls. */
export function SeasonTabs<T extends string>(props: SegmentedControlProps<T>) {
  return <SegmentedControl {...props} tone="accent" />;
}
