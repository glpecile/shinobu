import { zodResolver } from '@hookform/resolvers/zod';
import { openAuthSessionAsync } from 'expo-web-browser';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Linking, Platform, Text, TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Button } from '@/components/button';
import { Collapsible } from '@/components/collapsible';
import { PresstableOpacity } from '@/components/presstable';
import { Steps } from '@/components/steps';
import { SIMKL_CREATE_APP_URL } from '@/lib/providers/external-urls';
import {
  beginSimklAuthFlow,
  clearSimklAuthFlow,
} from '@/lib/providers/simkl/auth';
import { simklClientId } from '@/lib/providers/simkl/config';
import {
  getSimklRedirectUri,
  SIMKL_REDIRECT_URIS,
} from '@/lib/providers/simkl/redirect-uri';
import { exchangeSimklCode } from '@/state/queries/simkl';
import {
  clearProviderClientId,
  getProviderClientId,
  setProviderClientId,
} from '@/state/session/tokens';

type ConnectionStatus = 'idle' | 'connecting' | 'error';

// Simkl client ids are long hex strings — catch pasted URLs/names/secrets
// with spaces, not a specific length.
const clientIdSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1, 'Paste your Client ID first.')
    .regex(
      /^[a-f0-9]{16,}$/i,
      "That doesn't look like a Client ID — it's the long hex string on your Simkl app's page.",
    ),
});

type ClientIdForm = z.infer<typeof clientIdSchema>;

/**
 * Simkl's OAuth trigger, without any of its UI.
 *
 * Hybrid client-id model (owner decision 2026-08-01, superseding plan 0034
 * U5's "no BYO wizard"): builds that bundle a PKCE client id
 * (`EXPO_PUBLIC_SIMKL_CLIENT_ID` — no secret exists, KTD-1) connect in one
 * tap; a build without one falls back to an AniList-style one-time form that
 * takes the user's own Simkl app client id (a single field — PKCE has no
 * secret to pair it with). `beginSimklAuthFlow` persists the PKCE
 * verifier/state pair for the return leg. On native, auth opens in an embedded
 * browser session and this hook finishes the code exchange from the returned
 * URL — the same in-button return handling as Trakt's code flow; the exchange
 * validates `state` against the persisted flow internally. On web, the current
 * window navigates to Simkl and comes back to the home route as
 * `?oauth=simkl&code=…`, where `useOAuthCallback` exchanges it (both legs read
 * the stored override via `getClientIdForProvider`).
 *
 * Extracted so the Manage Trackers row can connect in one tap without opening
 * a sheet whose only content would be this button; the button below consumes
 * the same hook, so there is exactly one copy of the flow.
 */
export function useSimklConnect() {
  const [storedClientId, setStoredClientId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : getProviderClientId('simkl'),
  );
  const [status, setStatus] = useState<ConnectionStatus>('idle');

  const embeddedClientId = simklClientId();
  // Override-first, matching provider-config's simkl resolver.
  const clientId = storedClientId ?? embeddedClientId;
  const redirectUri = getSimklRedirectUri();

  async function connect(id: string = clientId) {
    if (id === '') return;

    setStatus('connecting');
    let url: string;
    try {
      url = await beginSimklAuthFlow({ clientId: id, redirectUri });
    } catch (error) {
      setStatus('error');
      console.error('Simkl auth flow could not be started', error);
      return;
    }

    if (Platform.OS === 'web') {
      // Same-window redirect: Simkl sends the user back to the home route
      // with ?oauth=simkl&code=..., where useOAuthCallback exchanges it. This
      // avoids popup blockers and orphaned auth windows (the Trakt shape).
      window.location.assign(url);
      return;
    }

    const result = await openAuthSessionAsync(url, redirectUri);
    if (result.type !== 'success') {
      // User-cancelled/dismissed — not an error worth alarming about. The
      // pending PKCE flow is dead with it; don't leave it around to validate
      // some future stray code.
      clearSimklAuthFlow();
      setStatus('idle');
      return;
    }

    const returned = new URL(result.url);
    const code = returned.searchParams.get('code');
    const state = returned.searchParams.get('state');
    if (code == null) {
      // Simkl redirected back without a code (?error=...): a real failure.
      clearSimklAuthFlow();
      setStatus('error');
      return;
    }

    try {
      await exchangeSimklCode({ code, state: state ?? '', redirectUri });
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      console.error('Simkl OAuth exchange failed', error);
    }
  }

  return {
    connect,
    status,
    clientId,
    embeddedClientId,
    storedClientId,
    setStoredClientId,
    /** True when connecting first requires the one-time client-id form. */
    needsSetup: clientId === '',
  };
}

export function ConnectSimklButton() {
  const {
    connect,
    status,
    clientId,
    embeddedClientId,
    storedClientId,
    setStoredClientId,
  } = useSimklConnect();
  const muted = useCSSVariable('--color-muted');

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClientIdForm>({
    defaultValues: { clientId: '' },
    resolver: zodResolver(clientIdSchema),
  });
  // Saving the id means the user wants to connect — go straight into OAuth.
  const submitClientId = handleSubmit(async (values) => {
    setProviderClientId('simkl', values.clientId);
    setStoredClientId(values.clientId);
    await connect(values.clientId);
  });

  if (clientId === '') {
    return (
      <View className="w-full gap-4">
        <Text className="text-muted font-sans text-sm">
          This build ships no Simkl client id — connect through your own (free)
          Simkl app instead. One-time setup, under a minute, no secret needed.
        </Text>

        <Collapsible label="How to create the Simkl app">
          <Steps>
            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                Create an app at{' '}
                <Text
                  className="text-accent font-sans-semibold underline"
                  onPress={() => Linking.openURL(SIMKL_CREATE_APP_URL)}
                >
                  {SIMKL_CREATE_APP_URL.replace('https://', '')}
                </Text>
                . Name can be anything (e.g. "Shinobu").
              </Text>
            </Steps.Item>

            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                Add every{' '}
                <Text className="text-foreground font-sans-semibold">
                  Redirect URI
                </Text>{' '}
                below to the app, each exactly as written:
              </Text>
              {SIMKL_REDIRECT_URIS.map((uri) => (
                <View
                  className="border border-border bg-surface px-2 py-1 rounded-md self-start"
                  key={uri}
                >
                  <Text className="text-foreground font-sans text-xs" selectable>
                    {uri}
                  </Text>
                </View>
              ))}
            </Steps.Item>

            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                Save, then copy the app's{' '}
                <Text className="text-foreground font-sans-semibold">
                  Client ID
                </Text>{' '}
                (a long hex string) and paste it below.
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
              className="border border-border bg-surface text-foreground px-4 py-3 rounded-md font-sans"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              onSubmitEditing={() => submitClientId()}
              placeholder="Simkl Client ID"
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
        <Button
          label="Save & Connect"
          loading={isSubmitting || status === 'connecting'}
          loadingLabel="Connecting…"
          onPress={() => void submitClientId()}
        />
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
      <Button
        label="Connect Simkl"
        loading={status === 'connecting'}
        loadingLabel="Connecting…"
        onPress={() => void connect()}
      />
      {embeddedClientId === '' && storedClientId != null && (
        <PresstableOpacity
          onPress={() => {
            clearProviderClientId('simkl');
            setStoredClientId(null);
          }}
        >
          <Text className="text-muted font-sans text-xs">Edit client ID</Text>
        </PresstableOpacity>
      )}
    </View>
  );
}
