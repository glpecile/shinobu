import { setStringAsync } from 'expo-clipboard';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { PresstableOpacity } from '@/components/presstable';
import { Sheet } from '@/components/sheet';
import { toast } from '@/lib/toast';
import type { NormalizedMediaItem } from '@/types/media';

interface CopySubject {
  alternates?: string[];
  title: string;
  tmdbId?: number;
  year?: number | null;
}

/** The item's other names, minus the one already shown and any repeat (case-insensitive). */
export function alternateTitles(item: NormalizedMediaItem): string[] {
  const seen = new Set([item.title.toLowerCase()]);
  const shown: string[] = [];
  for (const candidate of [item.titles?.english, item.titles?.romaji, item.titles?.native]) {
    if (candidate == null || candidate === '' || seen.has(candidate.toLowerCase())) continue;
    seen.add(candidate.toLowerCase());
    shown.push(candidate);
  }
  return shown;
}

function copyChoices({ alternates = [], title, tmdbId, year }: CopySubject) {
  const plainTitle = title.replace(/[^\p{L}\p{M}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  return [
    ...[title, ...(year != null ? [`${title} (${year})`, `${plainTitle} ${year}`] : []), ...alternates].map(
      (text) => ({ label: `Copy “${text}”`, text }),
    ),
    ...(tmdbId != null
      ? [{ label: `Copy TMDB ID (${tmdbId})`, text: String(tmdbId) }]
      : []),
  ];
}

async function copy(text: string) {
  if (await setStringAsync(text)) toast.success('Copied', text);
  else toast.error('Couldn’t copy', 'Your browser blocked clipboard access.');
}

/**
 * The copy options as sheet content: `CopyTitle`'s own sheet, or a step that
 * swaps in place of another sheet's rows. `onClose` is the header's close
 * (back to the rows, for a step); `onCopied` runs as a choice is pressed.
 */
export function CopyTitleOptions({ onClose, onCopied, ...subject }: CopySubject & {
  onClose?: () => void;
  onCopied: () => void;
}) {
  return (
    <>
      <Sheet.Header onClose={onClose}>
        <Text className="text-2xl font-display text-foreground" numberOfLines={2}>
          {subject.title}
        </Text>
      </Sheet.Header>
      <View className="mt-5 gap-2">
        {copyChoices(subject).map((choice) => (
          <Button
            icon={<Button.Icon name="copy-outline" />}
            key={choice.label}
            label={choice.label}
            onPress={() => {
              onCopied();
              void copy(choice.text);
            }}
            variant="quiet"
          />
        ))}
      </View>
    </>
  );
}

/**
 * A page's heading, pressable: opens a small sheet that copies it alone, with
 * its year, as one of its alternate names, or as its TMDB id (the Letterboxd
 * gesture — one tap gets you the string you paste into another tracker's
 * search box).
 */
export function CopyTitle({ className, ...subject }: CopySubject & { className?: string }) {
  const [open, setOpen] = useState(false);
  const single = copyChoices(subject).length === 1;

  return (
    <>
      <PresstableOpacity
        accessibilityHint={single ? 'Copies it' : 'Opens copy options'}
        accessibilityRole="button"
        className={className}
        onPress={() => (single ? copy(subject.title) : setOpen(true))}
      >
        <Text className="text-3xl font-display text-foreground">{subject.title}</Text>
      </PresstableOpacity>
      <Sheet onClose={() => setOpen(false)} open={open}>
        <CopyTitleOptions {...subject} onCopied={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
