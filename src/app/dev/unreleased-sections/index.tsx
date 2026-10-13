import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Eyebrow } from '@/components/eyebrow';
import { Section } from '@/components/section';
import { StatTile } from '@/components/stat-tile';
import { formatAirDate } from '@/features/episode-details/episode-label';
import { SeasonHeader } from '@/features/show-seasons/season-accordion';
import { formatRelativeDay } from '@/lib/time/relative-day';
import type { NormalizedSeason } from '@/types/media';

/**
 * Playground for the unreleased-anime redundancy pick — four treatments of
 * the details screen's Progress tile + Seasons section before anything airs.
 * Everything below is a mock with fixture data (0/1 episodes, an empty
 * season, a premiere 20 days out); the winner gets implemented for real on
 * the details screen and this route gets deleted.
 */

const EMPTY_SEASON: NormalizedSeason = { number: 1, title: 'Episodes', episodes: [] };

function premiereDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 20);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

/** Today's Progress tile, values hardcoded to the fixture. */
function ProgressTile() {
  return (
    <View className="flex-row gap-4">
      <StatTile
        caption="episodes"
        label="Progress"
        value={
          <View className="flex-row items-baseline mt-0.5">
            <Text className="text-foreground text-2xl font-sans-semibold">0</Text>
            <Text className="text-muted text-2xl font-sans-semibold"> / 1</Text>
          </View>
        }
      />
    </View>
  );
}

/** Today's season row, collapsed, with the fixture's empty season. */
function EmptySeasonRow() {
  const [open, setOpen] = useState(false);
  return <SeasonHeader onToggle={() => setOpen(!open)} open={open} season={EMPTY_SEASON} />;
}

function SeasonsBlock() {
  return (
    <Section>
      <Section.Header>
        <Section.Title>Seasons</Section.Title>
      </Section.Header>
      <EmptySeasonRow />
    </Section>
  );
}

function Variant({
  name,
  rule,
  children,
}: {
  name: string;
  /** The shipping rule this variant proposes. */
  rule: string;
  children: ReactNode;
}) {
  return (
    <View className="mb-10">
      <Eyebrow>{name}</Eyebrow>
      <Text className="text-muted font-sans text-sm mt-1 mb-3">{rule}</Text>
      <View className="rounded-lg border border-border p-4">{children}</View>
    </View>
  );
}

export default function UnreleasedSectionsScreen() {
  const premiere = premiereDate();
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="w-full max-w-4xl self-center px-6 py-8">
        <Text className="text-foreground font-display text-2xl">Unreleased sections</Text>
        <Text className="text-muted font-sans text-sm mt-1 mb-6">
          Fixture: anime series, 0 of 1 episodes logged, season with nothing
          aired yet, premiere 20 days out. Mocks — pick a direction, implementation follows.
        </Text>

        <Variant
          name="A — Hide both"
          rule="Render neither section until something airs; the release timeline keeps the date."
        >
          <Text className="text-muted font-sans text-sm">
            Nothing renders — this space collapses.
          </Text>
        </Variant>

        <Variant
          name="B — Current"
          rule="Status quo, for comparison: 0/1 progress plus the empty season."
        >
          <ProgressTile />
          <View className="mt-6">
            <SeasonsBlock />
          </View>
        </Variant>

        <Variant
          name="C — Progress only"
          rule="Keep the tile, drop seasons with nothing aired."
        >
          <ProgressTile />
        </Variant>

        <Variant
          name="D — Upcoming tile"
          rule="Replace the 0/1 tile with a premiere countdown; seasons stay hidden."
        >
          <View className="flex-row gap-4">
            <StatTile
              caption={`First episode · ${formatAirDate(premiere)}`}
              label="Premieres"
              value={formatRelativeDay(premiere) ?? '—'}
            />
          </View>
        </Variant>
      </View>
    </ScrollView>
  );
}
