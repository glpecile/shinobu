import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ConnectTmdbTokenSection } from '@/components/connect-tmdb-token';
import Head from '@/components/head';
import { KeyboardAvoidingView } from '@/components/keyboard-avoiding-view';
import { RailHead } from '@/components/rail-head';
import {
  homeHeaderClassName,
  homeHeaderTitleSize,
} from '@/components/screen-header-spacing';
import { NotificationsSettingsSection } from '@/features/notifications/notifications-settings';
import { HiddenItemsSection } from '@/features/settings/hidden-items-section';
import { SettingsRail } from '@/features/settings/settings-rail';
import { ThemePicker } from '@/features/settings/theme-picker';
import { ProviderCardsSection } from '@/features/trackers/provider-cards-section';
import { cn } from '@/lib/cn';
import { openExternalUrl } from '@/lib/open-external-url';
import { useThemePreference } from '@/state/prefs/theme';

const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const;

const VERSION = Constants.expoConfig?.version;

export default function SettingsScreen() {
  const queryClient = useQueryClient();
  const theme = THEME_LABEL[useThemePreference()];
  const version = VERSION != null ? `v${VERSION}` : 'Unknown';

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>Settings — Shinobu</title>
      </Head>
      {/* A top-level tab (native tab bar / web sidebar), so Diary's header and no back button. */}
      <View className={homeHeaderClassName}>
        <Text className={cn(homeHeaderTitleSize, 'font-display text-foreground tracking-tight')}>
          Settings
        </Text>
      </View>

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <SettingsRail.Scroll
          className="flex-1"
          // Native clears the bottom tab bar (unmeasurable height); web doesn't.
          contentContainerClassName={process.env.EXPO_OS === 'web' ? 'pb-8' : 'pb-24'}
          keyboardShouldPersistTaps="handled"
          // This screen has no server data of its own — the useful refresh is
          // marking every cached query stale so the feed refetches on return.
          onRefresh={() => queryClient.invalidateQueries()}
          tab="settings"
        >
          {/* Full width from the left edge, like Diary's rail; wide web puts the index beside it. */}
          <View>
            <ProviderCardsSection />
            <NotificationsSettingsSection />
            <ConnectTmdbTokenSection />
            <SettingsRail.Section count={theme} icon="contrast-outline" title="Appearance">
              <SettingsRail.Head label={`Appearance, ${theme}`}>
                <RailHead.Icon name="contrast-outline">Appearance</RailHead.Icon>
                <RailHead.Count>{theme}</RailHead.Count>
              </SettingsRail.Head>
              <SettingsRail.Row>
                <View className="flex-1">
                  <ThemePicker />
                </View>
              </SettingsRail.Row>
            </SettingsRail.Section>
            <HiddenItemsSection />
            <SettingsRail.Section count={version} icon="information-circle-outline" title="About">
              <SettingsRail.Head label={`About, ${version}`}>
                <RailHead.Icon name="information-circle-outline">About</RailHead.Icon>
                <RailHead.Count>{version}</RailHead.Count>
              </SettingsRail.Head>
              <SettingsRail.Row>
                <SettingsRail.Lead>
                  {/* The 忍 kanji uses the OS font on purpose (AGENTS.md). */}
                  <Text className="text-accent text-xl">忍</Text>
                </SettingsRail.Lead>
                <SettingsRail.Text>
                  <SettingsRail.Title>Shinobu</SettingsRail.Title>
                  <SettingsRail.Subtitle>Version {VERSION ?? 'unknown'}</SettingsRail.Subtitle>
                </SettingsRail.Text>
                <Button
                  className="shrink-0"
                  icon={<Button.Icon name="open-outline" />}
                  label={process.env.EXPO_OS === 'web' ? 'View code' : 'View releases'}
                  onPress={() => {
                    void openExternalUrl(
                      process.env.EXPO_OS === 'web'
                        ? 'https://github.com/glpecile/shinobu'
                        : 'https://github.com/glpecile/shinobu/releases',
                    );
                  }}
                  size="md"
                  variant="quiet"
                />
              </SettingsRail.Row>
            </SettingsRail.Section>
          </View>
        </SettingsRail.Scroll>
      </KeyboardAvoidingView>
    </View>
  );
}
