import { useReducer } from 'react';

import { CollapsibleSection } from '@/components/collapsible-section';
import { ProviderIcon } from '@/components/provider-icon';
import type { SerializdUpcomingEpisode } from '@/lib/providers/serializd/upcoming';
import { formatCalendarDate } from '@/lib/time/calendar-date';
import { localDayAt, localDayOffset } from '@/lib/time/relative-day';
import { useWakeAt } from '@/lib/time/use-wake-at';
import { useHiddenItems, visibleByIds } from '@/state/prefs/hidden-items';
import { useSuspenseSerializdUpcomingQuery } from '@/state/queries/serializd';
import type { NormalizedMediaItem } from '@/types/media';

import type { CardBadge } from './badges';
import { groupDayEntries } from './group';
import type { UpNextEpisodeEntry } from './types';
import { EpisodeCardRail } from './ui/episode-card-rail';

/** "Tomorrow" while it orients, then "Sun, Nov 1", with the year once it isn't this one. */
function dayLabel(airDate: string, now: Date): string {
  const offset = localDayOffset(airDate, now);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  const thisYear = airDate.startsWith(String(now.getFullYear()));
  return formatCalendarDate(airDate, { weekday: 'short', ...(thisYear ? { year: undefined } : {}) });
}

function marker(episode: SerializdUpcomingEpisode | undefined): string | null {
  if (episode == null) return null;
  if (episode.isPremiere) return episode.number === 1 && episode.season === 1 ? 'Series premiere' : 'Premiere';
  return episode.isFinale ? 'Finale' : null;
}

function toEntry(episode: SerializdUpcomingEpisode): UpNextEpisodeEntry {
  return {
    id: `${episode.item.id}/${episode.season}/${episode.number}`,
    // The still is this episode's own art; the show backdrop is the fallback.
    item: { ...episode.item, backdropImage: episode.still ?? episode.item.backdropImage },
    status: 'upcoming',
    source: 'serializd',
    kind: 'episode',
    episode: {
      season: episode.season,
      number: episode.number,
      ...(episode.title != null ? { title: episode.title } : {}),
      firstAired: episode.airDate,
      ...(episode.runtime != null ? { runtime: episode.runtime } : {}),
    },
  };
}

function newDate(): Date {
  return new Date();
}

/**
 * Serializd's "Coming soon" under the watchlist: each followed show's next air
 * day, on This Week's cards. No View all; the first page is the row.
 */
export function ComingSoonRow({ username, onItemActions, onItemPress }: {
  username: string;
  onItemActions: (item: NormalizedMediaItem) => void;
  onItemPress: (item: NormalizedMediaItem) => void;
}) {
  const { data } = useSuspenseSerializdUpcomingQuery(username);
  const hidden = useHiddenItems();
  const [now, refreshNow] = useReducer(newDate, undefined, newDate);
  useWakeAt(localDayAt(1, now).getTime(), now, refreshNow);
  // One card per show at its next air day, so a season drop stacks as it does
  // on This Week; already-aired entries belong to Continue Watching.
  const byEntry = new Map<string, SerializdUpcomingEpisode>();
  const entries: UpNextEpisodeEntry[] = [];
  const shows = new Map<string, string>();
  const visible = visibleByIds(data, hidden, (entry) => [entry.item.id]);
  for (const episode of [...visible].sort((a, b) => a.airDate.localeCompare(b.airDate))) {
    if ((localDayOffset(episode.airDate, now) ?? -1) < 0) continue;
    const day = shows.get(episode.item.id) ?? episode.airDate;
    if (day !== episode.airDate) continue;
    shows.set(episode.item.id, day);
    const entry = toEntry(episode);
    byEntry.set(entry.id, episode);
    entries.push(entry);
  }
  const groups = groupDayEntries(entries);
  if (groups.length === 0) return null;
  return (
    <CollapsibleSection
      collapseKey="serializd-coming-soon"
      leading={<ProviderIcon id="serializd" size={16} />}
      title="Coming Soon"
    >
      <EpisodeCardRail
        badges={(group) => {
          const lead = byEntry.get(group.lead.id);
          const badge = group.entries.length === 1 ? marker(lead) : null;
          return [
            { label: dayLabel(lead?.airDate ?? '', now), tone: 'accent' },
            ...(badge != null ? [{ label: badge }] : []),
          ] satisfies CardBadge[];
        }}
        groups={groups}
        onActionsPress={onItemActions}
        onPress={onItemPress}
        stacked
      />
    </CollapsibleSection>
  );
}
