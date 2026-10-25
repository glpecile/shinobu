import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState, type ComponentProps } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { List } from '@/components/List';
import { RailHead } from '@/components/rail-head';
import { TextField } from '@/components/text-field';
import { SettingsRail } from '@/features/settings/settings-rail';
import { usePushRoute } from '@/lib/navigation';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { useThemeColor } from '@/lib/theme-color';
import { unhideItem, unhideList, useHiddenItems, useHiddenLists } from '@/state/prefs/hidden-items';
import type { MediaType } from '@/types/media';

const PREVIEW = 5;
/** Past this many hidden entries the section grows a title search. */
const SEARCH_MIN = 20;

type Kind = MediaType | 'LIST' | 'LEGACY';

const KIND_ICON: Record<Kind, ComponentProps<typeof Ionicons>['name']> = {
  MOVIE: 'film-outline',
  TV: 'tv-outline',
  ANIME: 'tv-outline',
  MANGA: 'book-outline',
  LIST: 'list-outline',
  LEGACY: 'albums-outline',
};

/** Items hidden before their type was stored still name it when their provider tracks one type. */
function legacyKind(id: string): Kind {
  const types = PROVIDERS[id.split('-')[0] as ProviderId]?.mediaTypes;
  return types?.length === 1 ? types[0] : 'LEGACY';
}

const KIND_LABEL: Record<Kind, string> = {
  MOVIE: 'Movie',
  TV: 'TV show',
  ANIME: 'Anime',
  MANGA: 'Manga',
  LIST: 'List',
  LEGACY: 'Hidden item',
};

/**
 * Feed items hidden from a card's actions dialog, then lists hidden from a
 * list card's sheet, in saved order. Settings is the only place to unhide, so
 * hiding is always reversible. A row opens the item's details page (which
 * resolves hidden items too) or the list; its Show button unhides it.
 * Renders nothing while nothing is hidden.
 */
export function HiddenItemsSection() {
  const pushRoute = usePushRoute();
  const muted = useThemeColor('--color-muted');
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const hidden = [
    ...useHiddenItems().map((item) => ({
      key: `item-${item.id}`,
      title: item.title.trim() || 'Untitled',
      kind: item.type ?? legacyKind(item.id),
      href: routes.details(item.id),
      unhide: () => unhideItem(item.id),
    })),
    ...useHiddenLists().map((list) => ({
      key: `list-${list.id}`,
      title: list.title.trim() || 'Untitled',
      kind: 'LIST' as Kind,
      href: list.id,
      unhide: () => unhideList(list.id),
    })),
  ];

  if (hidden.length === 0) return null;

  const needle = query.trim().toLowerCase();
  const matches = needle ? hidden.filter((entry) => entry.title.toLowerCase().includes(needle)) : hidden;
  const shown = expanded ? matches : matches.slice(0, PREVIEW);
  const rest = matches.length - shown.length;
  const count = `${hidden.length} ${hidden.length === 1 ? 'item' : 'items'}`;

  return (
    <SettingsRail.Section count={count} icon="eye-off-outline" title="Hidden">
      <SettingsRail.Head label={`Hidden, ${count}`}>
        <RailHead.Icon name="eye-off-outline">Hidden</RailHead.Icon>
        <RailHead.Count>{count}</RailHead.Count>
      </SettingsRail.Head>
      {(hidden.length > SEARCH_MIN || query.length > 0) && (
        <SettingsRail.Row>
          <View className="flex-1">
            <TextField
              accessibilityLabel="Search hidden items"
              onChangeText={setQuery}
              placeholder={`Search ${hidden.length} hidden`}
              returnKeyType="search"
              value={query}
            />
          </View>
        </SettingsRail.Row>
      )}
      {shown.length > 0 && (
        <SettingsRail.Row>
          <View className="flex-1" style={{ height: Math.min(shown.length, PREVIEW) * 64 }}>
            <List
              data={shown}
              keyExtractor={(entry) => entry.key}
              nestedScrollEnabled
              renderItem={({ item: entry }) => (
                <View className="flex-row items-center gap-3 min-h-16">
                  <SettingsRail.Target accessibilityLabel={`Open ${entry.title}`} onPress={() => pushRoute(entry.href)}>
                    <SettingsRail.Lead>
                      <Ionicons color={muted} name={KIND_ICON[entry.kind]} size={18} />
                    </SettingsRail.Lead>
                    <SettingsRail.Text>
                      <SettingsRail.Title>{entry.title}</SettingsRail.Title>
                      <SettingsRail.Subtitle>{KIND_LABEL[entry.kind]}</SettingsRail.Subtitle>
                    </SettingsRail.Text>
                  </SettingsRail.Target>
                  <Button
                    accessibilityLabel={`Show ${entry.title} again`}
                    icon={<Button.Icon name="eye-outline" />}
                    label="Show"
                    onPress={entry.unhide}
                    size="md"
                    variant="quiet"
                  />
                </View>
              )}
            />
          </View>
        </SettingsRail.Row>
      )}
      {matches.length === 0 && (
        <SettingsRail.Row>
          <SettingsRail.Lead>
            <Ionicons color={muted} name="search-outline" size={18} />
          </SettingsRail.Lead>
          <SettingsRail.Text>
            <SettingsRail.Title>No matches</SettingsRail.Title>
          </SettingsRail.Text>
        </SettingsRail.Row>
      )}
      {rest > 0 ? (
        <SettingsRail.Row>
          <Button
            icon={<Button.Icon name="chevron-down" />}
            label={`Show ${rest} more`}
            onPress={() => setExpanded(true)}
            size="md"
            variant="quiet"
          />
        </SettingsRail.Row>
      ) : (
        expanded &&
        matches.length > PREVIEW && (
          <SettingsRail.Row>
            <Button
              icon={<Button.Icon name="chevron-up" />}
              label="Show less"
              onPress={() => setExpanded(false)}
              size="md"
              variant="quiet"
            />
          </SettingsRail.Row>
        )
      )}
    </SettingsRail.Section>
  );
}
