import Ionicons from '@react-native-vector-icons/ionicons/static';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Linking, Text, View } from 'react-native';
import { z } from 'zod';

import { Button } from '@/components/button';
import { Collapsible } from '@/components/collapsible';
import { RailHead } from '@/components/rail-head';
import { Steps } from '@/components/steps';
import { TextField } from '@/components/text-field';
import { SettingsRail } from '@/features/settings/settings-rail';
import { TMDB_API_SETTINGS_URL } from '@/lib/providers/external-urls';
import { TMDB_API_BASE_URL } from '@/lib/providers/tmdb/config';
import { useThemeColor } from '@/lib/theme-color';
import { mediaDetailsQueryKeys } from '@/state/queries/media-details';
import { tmdbQueryKeys } from '@/state/queries/tmdb';
import {
  clearTmdbToken,
  hasBuilderTmdbToken,
  saveTmdbToken,
  storedTmdbToken,
} from '@/state/session/tmdb-token';

type SaveStatus = 'idle' | 'checking' | 'invalid' | 'unreachable';

// v4 read tokens are long JWTs (three dot-separated base64url segments). The
// shape check catches the two common mistakes — pasting the short v3 API key,
// or pasting the whole curl example — before a request is ever made.
const tokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, 'Paste your API Read Access Token first.')
    .regex(
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
      'That looks like the short v3 API Key. Shinobu needs the long "API Read Access Token" from the same page.',
    ),
});

type TokenForm = z.infer<typeof tokenSchema>;

/** Cheapest authenticated TMDB call — 200 iff the token is accepted. */
async function tokenWorks(token: string): Promise<boolean> {
  const response = await fetch(`${TMDB_API_BASE_URL}/authentication`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  return response.ok;
}

const STATUS_MESSAGE: Record<Exclude<SaveStatus, 'idle' | 'checking'>, string> = {
  invalid: 'TMDB rejected that token. Copy the API Read Access Token again.',
  unreachable: "Couldn't reach TMDB to check that token. Try again in a moment.",
};

/**
 * Bring-your-own TMDB key (plan 0024 U10). TMDB is the primary metadata source
 * for every detail screen and the only source for the person/studio routes
 * (AGENTS.md), but its token is builder-supplied — a build that ships none
 * leaves those surfaces dark with no way in from the app. Settings' Metadata
 * section is that way in, and it renders **only** when the build ships no token: with one
 * present a stored value would be ignored anyway (`resolveTmdbToken`), so
 * offering the field would be a lie.
 *
 * Modeled on `connect-anilist-button.tsx`: react-hook-form + zod, a collapsed
 * how-to, and an edit/clear escape hatch. The token is validated against TMDB
 * before it is persisted, and it is never logged.
 */
export function ConnectTmdbTokenSection() {
  // SSR-safe lazy initializer — MMKV's web fallback is localStorage
  // (docs/solutions/expo-web-ssr-mmkv-storage-on-server.md).
  const [saved, setSaved] = useState<string | null>(() => storedTmdbToken());
  const [status, setStatus] = useState<SaveStatus>('idle');
  const queryClient = useQueryClient();
  const muted = useThemeColor('--color-muted');

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TokenForm>({
    defaultValues: { token: '' },
    resolver: zodResolver(tokenSchema),
  });

  /**
   * Details and TMDB reads resolved *without* a token are cached for an hour
   * with the token outside their query key — so without this drop, an
   * already-visited screen keeps serving provider-only metadata and the new
   * token looks like it needs an app restart (R13).
   */
  function dropTokenlessCaches() {
    queryClient.removeQueries({ queryKey: mediaDetailsQueryKeys.all });
    queryClient.removeQueries({ queryKey: tmdbQueryKeys.all });
  }

  const submit = handleSubmit(async (values) => {
    setStatus('checking');
    let accepted: boolean;
    try {
      accepted = await tokenWorks(values.token);
    } catch {
      // Network failure, not a bad token — say so rather than blaming the key.
      setStatus('unreachable');
      return;
    }
    if (!accepted) {
      setStatus('invalid');
      return;
    }
    saveTmdbToken(values.token);
    setSaved(values.token);
    setStatus('idle');
    reset({ token: '' });
    dropTokenlessCaches();
  });

  function clear() {
    clearTmdbToken();
    setSaved(null);
    setStatus('idle');
    reset({ token: '' });
    dropTokenlessCaches();
  }

  if (hasBuilderTmdbToken()) return null;

  const count = saved != null ? 'TMDB' : 'Not set';

  return (
    <SettingsRail.Section count={count} icon="sparkles-outline" title="Metadata">
      <SettingsRail.Head label={`Metadata, ${count}`}>
        <RailHead.Icon name="sparkles-outline">Metadata</RailHead.Icon>
        <RailHead.Count>{count}</RailHead.Count>
      </SettingsRail.Head>
      <SettingsRail.Row>
        <SettingsRail.Lead>
          <Ionicons color={muted} name="key-outline" size={18} />
        </SettingsRail.Lead>
        <SettingsRail.Text>
          <SettingsRail.Title>TMDB token</SettingsRail.Title>
          <SettingsRail.Subtitle>
            {saved != null ? 'Added' : 'Posters, cast, and people pages'}
          </SettingsRail.Subtitle>
        </SettingsRail.Text>
        {saved != null && (
          <Button
            accessibilityLabel="Remove TMDB token"
            className="shrink-0"
            icon={<Button.Icon name="trash-outline" />}
            label="Remove"
            onPress={clear}
            size="md"
            variant="outline"
          />
        )}
      </SettingsRail.Row>
      {saved == null && (
        <SettingsRail.Row>
          <View className="flex-1 gap-4">
            <Text className="text-muted font-sans text-sm">
              This build ships without a TMDB key, so detail pages fall back to
              your trackers’ metadata and the people and studio pages stay
              closed. Add your own (free) TMDB read token to turn them on.
            </Text>

            <Collapsible label="How to get your TMDB token">
              <Steps>
                <Steps.Item>
                  <Text className="text-muted font-sans text-sm">
                    Open{' '}
                    <Text
                      className="text-accent font-sans-semibold underline"
                      onPress={() => Linking.openURL(TMDB_API_SETTINGS_URL)}
                    >
                      {TMDB_API_SETTINGS_URL.replace('https://', '')}
                    </Text>{' '}
                    and sign in (creating an account is free).
                  </Text>
                </Steps.Item>

                <Steps.Item>
                  <Text className="text-muted font-sans text-sm">
                    Request an API key if you don’t have one — pick{' '}
                    <Text className="text-foreground font-sans-semibold">
                      Developer
                    </Text>
                    , personal use.
                  </Text>
                </Steps.Item>

                <Steps.Item>
                  <Text className="text-muted font-sans text-sm">
                    Copy the long{' '}
                    <Text className="text-foreground font-sans-semibold">
                      API Read Access Token
                    </Text>{' '}
                    — not the short API Key — and paste it below.
                  </Text>
                </Steps.Item>
              </Steps>
            </Collapsible>

            <Controller
              control={control}
              name="token"
              render={({ field }) => (
                <TextField
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  onSubmitEditing={() => void submit()}
                  placeholder="API Read Access Token"
                  returnKeyType="done"
                  // Long opaque credential — never offer to save/suggest it,
                  // and keep it off screen-sharing shoulder-surfers.
                  secureTextEntry
                  value={field.value}
                />
              )}
            />
            {errors.token != null && (
              <Text className="text-accent font-sans text-xs">
                {errors.token.message}
              </Text>
            )}
            {(status === 'invalid' || status === 'unreachable') && (
              <Text className="text-accent font-sans text-xs">
                {STATUS_MESSAGE[status]}
              </Text>
            )}
            <Button
              icon={<Button.Icon name="checkmark" />}
              label="Save token"
              // Validated against TMDB before it is stored, so this waits on a
              // real round-trip.
              loading={status === 'checking'}
              loadingLabel="Checking…"
              onPress={() => void submit()}
            />
          </View>
        </SettingsRail.Row>
      )}
    </SettingsRail.Section>
  );
}
