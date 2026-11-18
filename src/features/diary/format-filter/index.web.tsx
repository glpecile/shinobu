import { NativeSegmentedControl } from '@/components/native-segmented-control';

import { DIARY_FORMAT_OPTIONS, type DiaryFormat } from '@/features/diary/merge';

/** Web has the width for every option at once. */
export function DiaryFormatFilter({
  value,
  onChange,
}: {
  value: DiaryFormat;
  onChange: (format: DiaryFormat) => void;
}) {
  return (
    <NativeSegmentedControl
      accessibilityLabel="Format"
      className="w-72 shrink"
      onChange={onChange}
      options={DIARY_FORMAT_OPTIONS}
      size="sm"
      value={value}
    />
  );
}
