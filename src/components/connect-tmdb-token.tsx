import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Linking, Text, TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { z } from 'zod';

import { Button } from '@/components/button';
import { Collapsible } from '@/components/collapsible';
import { Steps } from '@/components/steps';
import { CARD_SHELL } from '@/components/card-shell';
import { cn } from '@/lib/cn';
import { TMDB_API_SETTINGS_URL } from '@/lib/providers/external-urls';
import { TMDB_API_BASE_URL } from '@/lib/providers/tmdb/config';
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
 * leaves those surfaces dark with no way in from the app. This section is that
 * way in, and it renders **only** when the build ships no token: with one
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
  const muted = useCSSVariable('--color-muted');
  const queryClient = useQueryClient();

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

  return (
    <View>
      <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider mb-3">
        TMDB token
      </Text>
      <View className={cn(CARD_SHELL, 'gap-4')}>
        {saved != null ? (
          <>
            <Text className="text-foreground font-sans-semibold text-base">
              TMDB connected
            </Text>
            <Text className="text-muted font-sans text-sm">
              Detail pages use TMDB for artwork, cast, crew, and studios, and
              the people and studio pages are available.
            </Text>
            <Button
              accessibilityLabel="Remove TMDB token"
              className="self-start"
              label="Remove token"
              onPress={clear}
              size="sm"
              variant="outline"
            />
          </>
        ) : (
          <>
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
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="border border-border bg-background text-foreground px-4 py-3 rounded-md font-sans"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  onSubmitEditing={() => void submit()}
                  placeholder="API Read Access Token"
                  placeholderTextColor={
                    typeof muted === 'string' ? muted : undefined
                  }
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
              label="Save token"
              // Validated against TMDB before it is stored, so this waits on a
              // real round-trip.
              loading={status === 'checking'}
              loadingLabel="Checking…"
              onPress={() => void submit()}
            />
          </>
        )}
      </View>
    </View>
  );
}
