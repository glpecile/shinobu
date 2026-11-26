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
import { SIMKL_CREATE_APP_URL } from '@/lib/providers/external-urls';
import { beginSimklAuthFlow, clearSimklAuthFlow } from '@/lib/providers/simkl/auth';
import { simklClientId } from '@/lib/providers/simkl/config';
import { getSimklRedirectUri, SIMKL_REDIRECT_URIS } from '@/lib/providers/simkl/redirect-uri';
import { Provider } from '@/lib/providers/types';
import { exchangeSimklCode } from '@/state/queries/simkl';
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
      /^[a-f0-9]{16,}$/i,
      "That doesn't look like a Client ID — it's the long hex string on your Simkl app's page.",
    ),
});

type ClientIdForm = z.infer<typeof clientIdSchema>;

export function useSimklConnect() {
  const [storedClientId, setStoredClientId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : getProviderClientId(Provider.Simkl),
  );
  const [status, setStatus] = useState<ConnectionStatus>('idle');

  const embeddedClientId = simklClientId();
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
      window.location.assign(url);
      return;
    }

    const result = await openAuthSessionAsync(url, redirectUri);
    if (result.type !== 'success') {
      clearSimklAuthFlow();
      setStatus('idle');
      return;
    }

    const returned = new URL(result.url);
    const code = returned.searchParams.get('code');
    const state = returned.searchParams.get('state');
    if (code == null) {
      clearSimklAuthFlow();
      setStatus('error');
      return;
    }

    await exchangeSimklCode({ code, state: state ?? '', redirectUri }).then(
      () => setStatus('idle'),
      (error: unknown) => {
        setStatus('error');
        console.error('Simkl OAuth exchange failed', error);
      },
    );
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

export function ConnectSimklButton() {
  const { connect, status, clientId, embeddedClientId, storedClientId, setStoredClientId } =
    useSimklConnect();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClientIdForm>({
    defaultValues: { clientId: '' },
    resolver: zodResolver(clientIdSchema),
  });
  const submitClientId = handleSubmit(async (values) => {
    setProviderClientId(Provider.Simkl, values.clientId);
    setStoredClientId(values.clientId);
    await connect(values.clientId);
  });

  if (clientId === '') {
    return (
      <View className="w-full gap-4">
        <Text className="text-muted font-sans text-sm">
          This build ships no Simkl client id — connect through your own (free) Simkl app instead.
          One-time setup, under a minute, no secret needed.
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
                Add every <Text className="text-foreground font-sans-semibold">Redirect URI</Text>{' '}
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
                <Text className="text-foreground font-sans-semibold">Client ID</Text> (a long hex
                string) and paste it below.
              </Text>
            </Steps.Item>
          </Steps>
        </Collapsible>

        <Controller
          control={control}
          name="clientId"
          render={({ field }) => (
            <TextField
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              onSubmitEditing={() => submitClientId()}
              placeholder="Simkl Client ID"
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
        You sign in on Simkl's own site, and Shinobu keeps only the resulting access token on this
        device — your password is never sent to Shinobu.
      </Text>
      {status === 'error' && (
        <Text className="text-accent font-sans text-xs">
          Could not connect. Tap Connect to try again.
        </Text>
      )}
      <Button
        icon={<Button.Icon name="link-outline" />}
        label="Connect Simkl"
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
            clearProviderClientId(Provider.Simkl);
            setStoredClientId(null);
          }}
          size="sm"
          variant="ghost"
        />
      )}
    </View>
  );
}
