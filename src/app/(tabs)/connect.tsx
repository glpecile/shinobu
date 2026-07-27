import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import Head from '@/components/head';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Button } from '@/components/button';
import { CARD_SHELL } from '@/components/card-shell';
import { ConnectTmdbTokenSection } from '@/components/connect-tmdb-token';
import { KeyboardAvoidingView } from '@/components/keyboard-avoiding-view';
import { PresstableOpacity } from '@/components/presstable';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { NotificationsSettingsSection } from '@/features/notifications/notifications-settings';
import { ProviderCardsSection } from '@/features/trackers/provider-cards-section';
import { cn } from '@/lib/cn';
import { routes } from '@/lib/routes';
import { unhideItem, useHiddenItems } from '@/state/prefs/hidden-items';

/**
 * One column width and one gutter for the whole screen. Web's navigation rail
 * eats 64px of a phone-sized viewport before this screen sees it, so the gutter
 * is a notch tighter there to leave the card interiors the same room native
 * gets; `max-w-2xl` is the detail screens' centering pattern, narrowed because
 * settings read better in a shorter measure than a details page.
 */
const CONTENT_COLUMN = 'w-full max-w-2xl self-center';
const CONTENT_GUTTER = process.env.EXPO_OS === 'web' ? 'px-4' : 'px-6';

/**
 * Feed items hidden from a card's actions dialog. Listed here (the only
 * settings surface) so hiding is always reversible; the row itself opens the
 * item's details page (which resolves hidden items too — includeHidden).
 */
function HiddenItemsSection() {
  const router = useRouter();
  const hidden = useHiddenItems();
  const muted = useCSSVariable('--color-muted');

  if (hidden.length === 0) return null;

  return (
    <View>
      <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider mb-3">
        Hidden items
      </Text>
      <View className="gap-3">
        {hidden.map((item) => (
          <View
            className={cn('flex-row items-center justify-between opacity-60', CARD_SHELL)}
            key={item.id}
          >
            <PresstableOpacity
              accessibilityLabel={`Open ${item.title}`}
              className="flex-1 flex-row items-center gap-3 mr-3"
              onPress={() => router.push(routes.details(item.id))}
            >
              <Ionicons
                color={typeof muted === 'string' ? muted : undefined}
                name="eye-off-outline"
                size={18}
              />
              <Text
                className="flex-1 text-foreground font-sans-semibold text-base"
                numberOfLines={1}
              >
                {item.title}
              </Text>
            </PresstableOpacity>
            <Button
              accessibilityLabel={`Show ${item.title} again`}
              label="Show"
              onPress={() => unhideItem(item.id)}
              size="sm"
              variant="quiet"
            />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ConnectScreen() {
  const queryClient = useQueryClient();

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>Manage Trackers — Shinobu</title>
      </Head>
      {/* A top-level tab now (native tab bar / web sidebar) — no back button.
          Same column + gutter as the content so the title sits on the cards'
          left edge at every width. */}
      <View
        className={cn(
          'flex-row items-center',
          CONTENT_COLUMN,
          CONTENT_GUTTER,
          screenHeaderTopPadding,
          'pb-4',
        )}
      >
        <Text className="text-2xl font-display text-foreground">
          Manage Trackers
        </Text>
      </View>

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <RefreshableScrollView
          className="flex-1"
          // Native clears the bottom tab bar (unmeasurable height); web doesn't.
          contentContainerClassName={
            process.env.EXPO_OS === 'web' ? 'pb-8' : 'pb-24'
          }
          keyboardShouldPersistTaps="handled"
          // This screen has no server data of its own — the useful refresh is
          // marking every cached query stale so the feed refetches on return.
          onRefresh={() => queryClient.invalidateQueries()}
        >
          {/* One `gap-6` owns the rhythm between sections instead of each
              section carrying its own `mt-6`/`mb-6` — sections that render
              nothing (no hidden items, notifications on web) then cost no
              space at all, and the first one is never flush under the header:
              `pt-2` on top of the header's `pb-4` makes that first break the
              same 24px as every gap below it. */}
          <View className={cn(CONTENT_COLUMN, CONTENT_GUTTER, 'gap-6 pt-2')}>
            <ProviderCardsSection />
            <ConnectTmdbTokenSection />
            <NotificationsSettingsSection />
            <HiddenItemsSection />
          </View>
        </RefreshableScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
