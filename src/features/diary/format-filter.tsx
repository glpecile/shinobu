import Ionicons from '@react-native-vector-icons/ionicons/static';
import { type ComponentProps, useState } from 'react';
import { Platform } from 'react-native';

import { Button } from '@/components/button';
import { NativePickerMenu } from '@/components/native-picker-menu';
import { PickerSheet } from '@/components/picker-sheet';
import type { DiaryFormat } from '@/features/diary/merge';
import { useThemeColor } from '@/lib/theme-color';

const ICON: Record<DiaryFormat, ComponentProps<typeof Ionicons>['name']> = {
  ALL: 'albums-outline',
  MOVIE: 'film-outline',
  TV: 'tv-outline',
  READING: 'library-outline',
};

export function DiaryFormatFilter({
  options,
  value,
  onChange,
}: {
  options: readonly { value: DiaryFormat; label: string; accessibilityLabel?: string }[];
  value: DiaryFormat;
  onChange: (format: DiaryFormat) => void;
}) {
  const [open, setOpen] = useState(false);
  const muted = useThemeColor('--color-muted');
  const items = options.map((option) => ({
    ...option,
    icon: <Ionicons color={muted} name={ICON[option.value]} size={20} />,
  }));
  const selected = options.find((option) => option.value === value)!;
  return (
    <>
      <NativePickerMenu onSelect={onChange} options={items} title="Format" value={value}>
        <Button
          accessibilityLabel={`Format: ${selected.accessibilityLabel ?? selected.label}`}
          icon={<Button.Icon name={ICON[value]} />}
          label={selected.label}
          morphLabel
          onPress={() => setOpen(true)}
          shape="pill"
          size="sm"
          trailingIcon={<Button.Icon name="chevron-down" />}
          variant="quiet"
        />
      </NativePickerMenu>
      {Platform.OS === 'web' && (
        <PickerSheet
          onClose={() => setOpen(false)}
          onSelect={onChange}
          open={open}
          title="Format"
          value={value}
        >
          {items.map((item) => (
            <PickerSheet.Option key={item.value} {...item} />
          ))}
        </PickerSheet>
      )}
    </>
  );
}
