import { setStringAsync } from 'expo-clipboard';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { PresstableOpacity } from '@/components/presstable';
import { Sheet } from '@/components/sheet';
import { toast } from '@/lib/toast';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The details-page title, pressable: opens a small sheet that copies the title
 * alone or with its year (the Letterboxd gesture — one tap gets you the string
 * you paste into another tracker's search box).
 */
export function CopyTitle({ item }: { item: Pick<NormalizedMediaItem, 'title' | 'year'> }) {
  const [open, setOpen] = useState(false);
  const withYear = item.year != null ? `${item.title} (${item.year})` : null;

  const copy = async (text: string) => {
    setOpen(false);
    if (await setStringAsync(text)) toast.success('Copied', text);
    else toast.error('Couldn’t copy', 'Your browser blocked clipboard access.');
  };

  return (
    <>
      <PresstableOpacity
        accessibilityHint="Copy the title"
        accessibilityRole="button"
        onPress={() => setOpen(true)}
      >
        <Text className="text-3xl font-display text-foreground mt-1">{item.title}</Text>
      </PresstableOpacity>
      <Sheet onClose={() => setOpen(false)} open={open}>
        <Text className="text-2xl font-display text-foreground" numberOfLines={2}>
          {item.title}
        </Text>
        <View className="mt-5 gap-2">
          <Button
            align="start"
            icon={<Button.Icon name="copy-outline" />}
            label="Copy title"
            onPress={() => copy(item.title)}
            variant="quiet"
          />
          {withYear != null && (
            <Button
              align="start"
              icon={<Button.Icon name="copy-outline" />}
              label="Copy title and year"
              onPress={() => copy(withYear)}
              variant="quiet"
            />
          )}
        </View>
      </Sheet>
    </>
  );
}
