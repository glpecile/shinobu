import { NativeSegmentedControl } from '@/components/native-segmented-control';

import type { DiaryFormat } from '@/features/diary/merge';

/** Web has the width for every option at once. */
export function DiaryFormatFilter({
  options,
  value,
  onChange,
}: {
  options: readonly { value: DiaryFormat; label: string; accessibilityLabel?: string }[];
  value: DiaryFormat;
  onChange: (format: DiaryFormat) => void;
}) {
  return (
    <NativeSegmentedControl
      accessibilityLabel="Format"
      className="w-72 shrink"
      onChange={onChange}
      options={options}
      size="sm"
      value={value}
    />
  );
}
