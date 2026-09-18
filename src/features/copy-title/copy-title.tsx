import { setStringAsync } from 'expo-clipboard';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { PresstableOpacity } from '@/components/presstable';
import { Sheet } from '@/components/sheet';
import { toast } from '@/lib/toast';

/**
 * A page's heading, pressable: opens a small sheet that copies it alone, with
 * its year, as one of its alternate names, or as its TMDB id (the Letterboxd
 * gesture — one tap gets you the string you paste into another tracker's
 * search box).
 */
export function CopyTitle({
  alternates = [],
  className,
  title,
  tmdbId,
  year,
}: {
  alternates?: string[];
  className?: string;
  title: string;
  tmdbId?: number;
  year?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const choices = [
    ...[title, ...(year != null ? [`${title} (${year})`] : []), ...alternates].map(
      (text) => ({ label: `Copy “${text}”`, text }),
    ),
    ...(tmdbId != null
      ? [{ label: `Copy TMDB ID (${tmdbId})`, text: String(tmdbId) }]
      : []),
  ];

  const copy = async (text: string) => {
    setOpen(false);
    if (await setStringAsync(text)) toast.success('Copied', text);
    else toast.error('Couldn’t copy', 'Your browser blocked clipboard access.');
  };

  return (
    <>
      <PresstableOpacity
        accessibilityHint={choices.length > 1 ? 'Opens copy options' : 'Copies it'}
        accessibilityRole="button"
        className={className}
        onPress={() => (choices.length > 1 ? setOpen(true) : copy(title))}
      >
        <Text className="text-3xl font-display text-foreground">{title}</Text>
      </PresstableOpacity>
      <Sheet onClose={() => setOpen(false)} open={open}>
        <Text className="text-2xl font-display text-foreground" numberOfLines={2}>
          {title}
        </Text>
        <View className="mt-5 gap-2">
          {choices.map((choice) => (
            <Button
              align="start"
              icon={<Button.Icon name="copy-outline" />}
              key={choice.label}
              label={choice.label}
              onPress={() => copy(choice.text)}
              variant="quiet"
            />
          ))}
        </View>
      </Sheet>
    </>
  );
}
