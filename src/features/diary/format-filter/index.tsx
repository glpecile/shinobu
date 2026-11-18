import { Button } from '@/components/button';
import { NativePickerMenu } from '@/components/native-picker-menu';

import type { DiaryFormat } from '@/features/diary/merge';

/**
 * The diary's format filter as an anchored native menu. Four segments don't
 * fit beside the title at large text sizes, so native uses one pill.
 */
export function DiaryFormatFilter({
  options,
  value,
  onChange,
}: {
  options: readonly { value: DiaryFormat; label: string; accessibilityLabel?: string }[];
  value: DiaryFormat;
  onChange: (format: DiaryFormat) => void;
}) {
  const selected = options.find((option) => option.value === value)!;
  return (
    <NativePickerMenu onSelect={onChange} options={options} title="Format" value={value}>
      <Button
        accessibilityLabel={`Format: ${selected.accessibilityLabel ?? selected.label}`}
        icon={<Button.Icon name="filter-outline" />}
        label={selected.label}
        morphLabel
        // The native menu owns the press.
        onPress={() => {}}
        shape="pill"
        size="sm"
        trailingIcon={<Button.Icon name="chevron-down" />}
        variant="quiet"
      />
    </NativePickerMenu>
  );
}
