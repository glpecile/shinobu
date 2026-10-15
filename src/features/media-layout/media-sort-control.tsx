import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { NativePickerMenu } from '@/components/native-picker-menu';
import { PickerSheet } from '@/components/picker-sheet';
import type { MediaSort } from '@/lib/media-sort';
import { useThemeColor } from '@/lib/theme-color';
import { setMediaSort, type MediaSortScope } from '@/state/prefs/media-sort';

export function SortingLoadedNotice() {
  const muted = useThemeColor('--color-muted');
  return (
    <View accessible accessibilityLabel="Sorting loaded titles. This is not the full list." className="flex-row items-center gap-1.5">
      <Ionicons color={muted} name="information-circle-outline" size={16} />
      <Text className="font-sans text-sm text-muted">Sorting loaded titles</Text>
    </View>
  );
}

export function MediaSortControl({ scope, sort }: {
  scope: MediaSortScope;
  sort: MediaSort;
}) {
  const [open, setOpen] = useState(false);
  const options: { value: MediaSort; label: string }[] = [
    { value: 'default', label: scope === 'watchlist' ? 'Recently added' : 'List order' },
    { value: 'runtime-asc', label: 'Runtime: shortest first' },
    { value: 'runtime-desc', label: 'Runtime: longest first' },
    { value: 'year-desc', label: 'Release year: newest first' },
    { value: 'year-asc', label: 'Release year: oldest first' },
  ];
  const label = options.find((option) => option.value === sort)!.label;
  const compactLabel: Record<MediaSort, string> = {
    default: scope === 'watchlist' ? 'Recently added' : 'List order',
    'runtime-asc': 'Runtime ↑',
    'runtime-desc': 'Runtime ↓',
    'year-desc': 'Release year ↓',
    'year-asc': 'Release year ↑',
  };
  function select(value: MediaSort) {
    setMediaSort(scope, value);
  }
  return (
    <>
      <NativePickerMenu onSelect={select} options={options} title="Sort titles" value={sort}>
        <Button
          accessibilityLabel={`Sort: ${label}`}
          className="max-w-full"
          icon={<Button.Icon name="swap-vertical-outline" />}
          label={compactLabel[sort]}
          morphLabel
          onPress={() => setOpen(true)}
          shape="pill"
          size="sm"
          trailingIcon={<Button.Icon name="chevron-down" />}
          variant="quiet"
        />
      </NativePickerMenu>
      {Platform.OS === 'web' && (
        <PickerSheet onClose={() => setOpen(false)} onSelect={select} open={open} title="Sort titles" value={sort}>
          {options.map((option) => <PickerSheet.Option key={option.value} {...option} />)}
        </PickerSheet>
      )}
    </>
  );
}
