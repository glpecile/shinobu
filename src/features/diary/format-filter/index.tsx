import { Button } from '@/components/button';
import { NativePickerMenu } from '@/components/native-picker-menu';

import { DIARY_FORMAT_OPTIONS, type DiaryFormat } from '@/features/diary/merge';

/**
 * The diary's format filter as an anchored native menu. Four segments don't
 * fit beside the title at large text sizes, so native uses one pill.
 */
export function DiaryFormatFilter({
  value,
  onChange,
}: {
  value: DiaryFormat;
  onChange: (format: DiaryFormat) => void;
}) {
  const label = DIARY_FORMAT_OPTIONS.find((option) => option.value === value)?.label ?? 'All';
  return (
    <NativePickerMenu onSelect={onChange} options={DIARY_FORMAT_OPTIONS} title="Format" value={value}>
      <Button
        accessibilityLabel={`Format: ${label}`}
        icon={<Button.Icon name="filter-outline" />}
        label={label}
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
