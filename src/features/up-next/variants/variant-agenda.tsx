import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { MorphText } from '@/components/morph-text';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableScale } from '@/components/presstable';
import { groupCalendarByDay } from '@/features/up-next/compute';
import type { UpNextEntry } from '@/features/up-next/types';
import { useUpNextSections } from '@/features/up-next/use-up-next-sections';
import { episodeLabel } from '@/features/up-next/ui/episode-card';
import { QuickLogButton } from '@/features/up-next/ui/quick-log-button';
import {
  UpNextSectionHeader,
  VariantLabel,
} from '@/features/up-next/ui/section-header';
import { useCardArt } from '@/features/up-next/ui/use-card-art';

import type { UpNextVariantProps } from './variant-carousel';

/**
 * Variant B (plan 0019 U7) — a vertical agenda: what's ready to watch first,
 * then what's coming, bucketed under Today / Tomorrow / weekday headers. Rows
 * are compact (thumb + two lines) rather than cards, and the list is
 * deliberately non-virtualized: it lives inside the home scroll and is capped
 * at roughly 25 rows by the pool.
 */
function AgendaRow({
  entry,
  trailing,
  onItemPress,
  onItemActions,
}: {
  entry: UpNextEntry;
  trailing: ReactNode;
} & UpNextVariantProps) {
  const art = useCardArt(entry.item);

  return (
    <View className="flex-row items-center gap-3 px-4 py-2">
      <PresstableScale
        accessibilityLabel={`${entry.item.title}, ${episodeLabel(entry)}`}
        className="w-24 h-14 rounded-md overflow-hidden border border-border/50"
        onLongPress={() => onItemActions(entry.item)}
        onPress={() => onItemPress(entry.item)}
      >
        {art !== '' ? (
          <Image className="w-full h-full" contentFit="cover" source={{ uri: art }} />
        ) : (
          <PosterPlaceholder className="w-full h-full border-0" />
        )}
      </PresstableScale>
      <View className="flex-1">
        <Text
          className="text-foreground font-sans-semibold text-sm leading-tight"
          numberOfLines={1}
        >
          {entry.item.title}
        </Text>
        <MorphText className="text-muted font-sans text-xs mt-0.5">
          {episodeLabel(entry)}
        </MorphText>
      </View>
      {trailing}
    </View>
  );
}

export function UpNextAgendaVariant({
  onItemPress,
  onItemActions,
}: UpNextVariantProps) {
  const { continueWatching, calendar, now } = useUpNextSections();
  if (continueWatching.length === 0 && calendar.length === 0) return null;

  const days = groupCalendarByDay(calendar, now);

  return (
    <View>
      <VariantLabel text="Variant B — Agenda" />
      {continueWatching.length > 0 && (
        <UpNextSectionHeader
          collapseKey="up-next-variant-b-continue"
          title="Ready to watch"
        >
          {continueWatching.map((entry) => (
            <AgendaRow
              key={entry.item.id}
              entry={entry}
              onItemActions={onItemActions}
              onItemPress={onItemPress}
              trailing={<QuickLogButton entry={entry} />}
            />
          ))}
        </UpNextSectionHeader>
      )}
      {days.length > 0 && (
        <UpNextSectionHeader
          collapseKey="up-next-variant-b-calendar"
          title="Coming up"
        >
          {days.map((day) => (
            <View key={day.offset} className="mb-2">
              <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider px-4 mb-1">
                {day.label}
              </Text>
              {day.entries.map((entry) => (
                <AgendaRow
                  key={entry.item.id}
                  entry={entry}
                  onItemActions={onItemActions}
                  onItemPress={onItemPress}
                  trailing={
                    <Text className="text-muted font-sans text-xs">
                      {airTime(entry)}
                    </Text>
                  }
                />
              ))}
            </View>
          ))}
        </UpNextSectionHeader>
      )}
    </View>
  );
}

/** Local clock time of the air instant — the day is already the bucket header. */
function airTime(entry: UpNextEntry): string {
  const instant = entry.episode.firstAired;
  if (instant == null) return '';
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  return `${hours}:${String(date.getMinutes()).padStart(2, '0')}`;
}
