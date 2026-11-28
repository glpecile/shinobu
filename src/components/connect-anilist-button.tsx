import { zodResolver } from '@hookform/resolvers/zod';
import { openAuthSessionAsync } from 'expo-web-browser';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Linking, Platform, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Collapsible } from '@/components/collapsible';
import { Steps } from '@/components/steps';
import { TextField } from '@/components/text-field';
import { SHINOBU_NATIVE_REDIRECT_URI, SHINOBU_WEB_DOMAIN } from '@/lib/config';
import { anilistAuthorizeUrl, anilistClientId } from '@/lib/providers/anilist/config';
import { ANILIST_CREATE_CLIENT_URL } from '@/lib/providers/external-urls';
import { Provider } from '@/lib/providers/types';
import { connectAniListFromRedirect } from '@/state/queries/anilist';
import { beginOAuthFlow } from '@/state/session/oauth-flow';
import {
  clearProviderClientId,
  getProviderClientId,
  setProviderClientId,
} from '@/state/session/tokens';

type ConnectionStatus = 'idle' | 'connecting' | 'error';

const clientIdSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1, 'Paste your Client ID first.')
    .regex(
      /^\d+$/,
      "That doesn’t look like a Client ID — it’s the short number on your AniList client’s page.",
    ),
});

type ClientIdForm = z.infer<typeof clientIdSchema>;

function redirectUriForThisDevice(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location.origin) {
      return window.location.origin;
    }
    return SHINOBU_WEB_DOMAIN;
  }
  return SHINOBU_NATIVE_REDIRECT_URI;
}

export function useAniListConnect() {
  const [storedClientId, setStoredClientId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : getProviderClientId(Provider.AniList),
  );
  const [status, setStatus] = useState<ConnectionStatus>('idle');

  const embeddedClientId = anilistClientId();
  const clientId = embeddedClientId !== '' ? embeddedClientId : (storedClientId ?? '');

  async function connect(id: string = clientId) {
    if (id === '') return;

    setStatus('connecting');

    if (Platform.OS === 'web') {
      const state = crypto.randomUUID();
      beginOAuthFlow(Provider.AniList, state);
      window.location.assign(anilistAuthorizeUrl(id, state));
      return;
    }

    const result = await openAuthSessionAsync(anilistAuthorizeUrl(id), SHINOBU_NATIVE_REDIRECT_URI);
    if (result.type !== 'success') {
      setStatus('idle');
      return;
    }
    setStatus(connectAniListFromRedirect(result.url) ? 'idle' : 'error');
  }

  return {
    connect,
    status,
    clientId,
    embeddedClientId,
    storedClientId,
    setStoredClientId,
    needsSetup: clientId === '',
  };
}

export function ConnectAniListButton() {
  const { connect, status, clientId, embeddedClientId, storedClientId, setStoredClientId } =
    useAniListConnect();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClientIdForm>({
    defaultValues: { clientId: '' },
    resolver: zodResolver(clientIdSchema),
  });
  const submitClientId = handleSubmit(async (values) => {
    setProviderClientId(Provider.AniList, values.clientId);
    setStoredClientId(values.clientId);
    await connect(values.clientId);
  });

  if (clientId === '') {
    const redirectUri = redirectUriForThisDevice();

    return (
      <View className="w-full gap-4">
        <Text className="text-muted font-sans text-sm">
          Shinobu talks to AniList through your own (free) AniList API client — one-time setup,
          under a minute, no secret needed.
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
                Set <Text className="text-foreground font-sans-semibold">Redirect URL</Text> to
                exactly:
              </Text>
              <View className="border border-border bg-surface px-2 py-1 rounded-md self-start">
                <Text className="text-foreground font-sans text-xs" selectable>
                  {redirectUri}
                </Text>
              </View>
              <Text className="text-muted font-sans text-xs">
                AniList allows one redirect URL per client — to connect on another device type too,
                create a second client there.
              </Text>
            </Steps.Item>

            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                Save, then copy the client’s{' '}
                <Text className="text-foreground font-sans-semibold">ID</Text> (a short number) and
                paste it below.
              </Text>
            </Steps.Item>
          </Steps>
        </Collapsible>

        <Controller
          control={control}
          name="clientId"
          render={({ field }) => (
            <TextField
              inputMode="numeric"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              onSubmitEditing={() => submitClientId()}
              placeholder="AniList Client ID"
              returnKeyType="done"
              value={field.value}
            />
          )}
        />
        {errors.clientId != null && (
          <Text className="text-accent font-sans text-xs">{errors.clientId.message}</Text>
        )}
        <Button
          icon={<Button.Icon name="link-outline" />}
          label="Save & Connect"
          loading={isSubmitting || status === 'connecting'}
          loadingLabel="Connecting…"
          onPress={() => void submitClientId()}
        />
      </View>
    );
  }

  return (
    <View className="w-full gap-3">
      <Text className="text-muted font-sans text-sm">
        You sign in on AniList’s own site, and Shinobu keeps only the resulting access token on this
        device — your password is never sent to Shinobu.
      </Text>
      {status === 'error' && (
        <Text className="text-accent font-sans text-xs">
          Could not connect. Tap Connect to try again.
        </Text>
      )}
      <Button
        icon={<Button.Icon name="link-outline" />}
        label="Connect AniList"
        loading={status === 'connecting'}
        loadingLabel="Connecting…"
        onPress={() => void connect()}
      />
      {embeddedClientId === '' && storedClientId != null && (
        <Button
          className="self-center"
          icon={<Button.Icon name="create-outline" />}
          label="Edit client ID"
          onPress={() => {
            clearProviderClientId(Provider.AniList);
            setStoredClientId(null);
          }}
          size="sm"
          variant="ghost"
        />
      )}
    </View>
  );
}
