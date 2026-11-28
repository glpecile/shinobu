import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { loginSerializd } from '@/state/queries/serializd';
import { connectSerializd } from '@/state/session/serializd';

const credentialsSchema = z.object({
  email: z.string().trim().min(1, 'Enter your Serializd email.'),
  password: z.string().min(1, 'Enter your password.'),
});

type CredentialsForm = z.infer<typeof credentialsSchema>;

export function ConnectSerializdButton() {
  const login = useMutation({
    // Never paused offline: the persister writes paused mutations to storage,
    // and these variables carry the password.
    networkMode: 'always',
    mutationFn: (values: CredentialsForm) =>
      loginSerializd({ email: values.email.trim(), password: values.password }).then((session) =>
        connectSerializd(session),
      ),
  });

  const {
    control,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<CredentialsForm>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(credentialsSchema),
  });

  const submit = handleSubmit((values) => login.mutate(values));

  return (
    <View className="w-full gap-3">
      <Text className="text-muted font-sans text-sm">
        Sign in with your Serializd email and password. Shinobu exchanges them for an access token
        and keeps only the token — your password is never stored.
      </Text>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            accessibilityLabel="Serializd email"
            autoComplete="email"
            keyboardType="email-address"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            onSubmitEditing={() => setFocus('password')}
            placeholder="Serializd email"
            returnKeyType="next"
            value={field.value}
          />
        )}
      />
      {errors.email != null && (
        <Text className="text-accent font-sans text-xs" role="alert">{errors.email.message}</Text>
      )}
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            accessibilityLabel="Serializd password"
            autoComplete="current-password"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            onSubmitEditing={() => submit()}
            placeholder="Password"
            ref={field.ref}
            returnKeyType="done"
            secureTextEntry
            value={field.value}
          />
        )}
      />
      {errors.password != null && (
        <Text className="text-accent font-sans text-xs" role="alert">
          {errors.password.message}
        </Text>
      )}
      {login.error != null && (
        <Text className="text-accent font-sans text-xs" role="alert">
          {loginErrorText(login.error.message)}
        </Text>
      )}
      <Button
        icon={<Button.Icon name="link-outline" />}
        label="Connect Serializd"
        loading={login.isPending}
        loadingLabel="Connecting…"
        onPress={() => void submit()}
      />
    </View>
  );
}

function loginErrorText(message: string): string {
  return message.replace(/^serializd:\s*/i, '');
}
