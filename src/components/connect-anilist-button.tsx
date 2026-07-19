import { zodResolver } from '@hookform/resolvers/zod';
import { openAuthSessionAsync } from 'expo-web-browser';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Linking, Platform, Text, TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Collapsible } from '@/components/collapsible';
import { PresstableOpacity } from '@/components/presstable';
import { Steps } from '@/components/steps';
import { SHINOBU_NATIVE_REDIRECT_URI, SHINOBU_WEB_DOMAIN } from '@/lib/config';
import { anilistAuthorizeUrl, anilistClientId } from '@/lib/providers/anilist/config';
import { ANILIST_CREATE_CLIENT_URL } from '@/lib/providers/external-urls';
import { connectAniListFromRedirect } from '@/state/queries/anilist';
import {
  clearProviderClientId,
  getProviderClientId,
  setProviderClientId,
} from '@/state/session/tokens';

type ConnectionStatus = 'idle' | 'connecting' | 'error';

// AniList client ids are small integers (otraku's is 3535) — catch pasted
// URLs/names, not a specific length.
const clientIdSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1, 'Paste your Client ID first.')
    .regex(/^\d+$/, "That doesn't look like a Client ID — it's the short number on your AniList client's page."),
});

type ClientIdForm = z.infer<typeof clientIdSchema>;

/** The redirect URL the user's AniList client must register for this device. */
function redirectUriForThisDevice(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location.origin) {
      return window.location.origin;
    }
    return SHINOBU_WEB_DOMAIN;
  }
  return SHINOBU_NATIVE_REDIRECT_URI;
}

/**
 * AniList OAuth trigger — implicit grant, no secret (otraku-style, plan
 * 0011). Hybrid client-id model (2026-07-14): builds that embed a client id
 * (or set EXPO_PUBLIC_ANILIST_CLIENT_ID) connect in one tap; otherwise a
 * Trakt-style one-time form takes the user's own client id (a single field —
 * the implicit grant has no secret to pair it with). On native the embedded
 * browser session returns the token fragment directly; on web the window
 * navigates to AniList and returns to the home route with `#access_token=…`,
 * where `useOAuthCallback` consumes it.
 */
export function ConnectAniListButton() {
  const [storedClientId, setStoredClientId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : getProviderClientId('anilist'),
  );
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const muted = useCSSVariable('--color-muted');

  const embeddedClientId = anilistClientId();
  const clientId = embeddedClientId !== '' ? embeddedClientId : (storedClientId ?? '');

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientIdForm>({
    defaultValues: { clientId: '' },
    resolver: zodResolver(clientIdSchema),
  });
  // Saving the id means the user wants to connect — go straight into OAuth.
  const submitClientId = handleSubmit(async (values) => {
    setProviderClientId('anilist', values.clientId);
    setStoredClientId(values.clientId);
    await connect(values.clientId);
  });

  async function connect(id: string = clientId) {
    if (id === '') return;

    setStatus('connecting');
    const url = anilistAuthorizeUrl(id);

    if (Platform.OS === 'web') {
      // Same-window redirect; AniList returns to the client's registered
      // redirect URL (the site origin) with the token in the fragment.
      window.location.assign(url);
      return;
    }

    const result = await openAuthSessionAsync(url, SHINOBU_NATIVE_REDIRECT_URI);
    if (result.type !== 'success') {
      // User-cancelled/dismissed — not an error worth alarming about.
      setStatus('idle');
      return;
    }
    setStatus(connectAniListFromRedirect(result.url) ? 'idle' : 'error');
  }

  if (clientId === '') {
    const redirectUri = redirectUriForThisDevice();

    return (
      <View className="w-full gap-4">
        <Text className="text-muted font-sans text-sm">
          Shinobu talks to AniList through your own (free) AniList API client —
          one-time setup, under a minute, no secret needed.
        </Text>

        <Collapsible label="How to create the AniList client">
          <Steps>
            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                Create a client at{' '}
                <Text
                  className="text-accent font-sans-semibold underline"
                  onPress={() => Linking.openURL(ANILIST_CREATE_CLIENT_URL)}
                >
                  {ANILIST_CREATE_CLIENT_URL.replace('https://', '')}
                </Text>
                . Name can be anything (e.g. "Shinobu").
              </Text>
            </Steps.Item>

            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                Set <Text className="text-foreground font-sans-semibold">Redirect URL</Text>{' '}
                to exactly:
              </Text>
              <View className="border border-border bg-surface px-2 py-1 rounded self-start">
                <Text className="text-foreground font-sans text-xs" selectable>
                  {redirectUri}
                </Text>
              </View>
              <Text className="text-muted font-sans text-xs">
                AniList allows one redirect URL per client — to connect on
                another device type too, create a second client there.
              </Text>
            </Steps.Item>

            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                Save, then copy the client's{' '}
                <Text className="text-foreground font-sans-semibold">ID</Text>{' '}
                (a short number) and paste it below.
              </Text>
            </Steps.Item>
          </Steps>
        </Collapsible>

        <Controller
          control={control}
          name="clientId"
          render={({ field }) => (
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              className="border border-border bg-surface text-foreground px-4 py-3 rounded font-sans"
              inputMode="numeric"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              onSubmitEditing={() => submitClientId()}
              placeholder="AniList Client ID"
              placeholderTextColor={typeof muted === 'string' ? muted : undefined}
              returnKeyType="done"
              value={field.value}
            />
          )}
        />
        {errors.clientId != null && (
          <Text className="text-accent font-sans text-xs">
            {errors.clientId.message}
          </Text>
        )}
        <PresstableOpacity
          className="bg-accent px-5 py-3 rounded"
          onPress={() => submitClientId()}
        >
          <Text className="text-accent-foreground font-sans-semibold text-base text-center">
            Save & Connect
          </Text>
        </PresstableOpacity>
      </View>
    );
  }

  return (
    <View className="items-center gap-3">
      {status === 'error' && (
        <Text className="text-accent font-sans text-sm text-center">
          Could not connect. Tap Connect to try again.
        </Text>
      )}
      <PresstableOpacity
        className="bg-accent px-5 py-3 rounded"
        disabled={status === 'connecting'}
        onPress={() => connect()}
      >
        <Text className="text-accent-foreground font-sans-semibold text-base">
          {status === 'connecting' ? 'Connecting…' : 'Connect AniList'}
        </Text>
      </PresstableOpacity>
      {embeddedClientId === '' && storedClientId != null && (
        <PresstableOpacity
          onPress={() => {
            clearProviderClientId('anilist');
            setStoredClientId(null);
          }}
        >
          <Text className="text-muted font-sans text-xs">Edit client ID</Text>
        </PresstableOpacity>
      )}
    </View>
  );
}
