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
      loginSerializd({ email: values.email.trim(), password: values.password })
        .then((session) => connectSerializd(session)),
  });

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CredentialsForm>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(credentialsSchema),
  });

  const submit = handleSubmit((values) => login.mutate(values));

  return (
    <View className="w-full gap-3">
      <Text className="text-muted font-sans text-sm">
        Sign in with your Serializd email and password. Shinobu exchanges them for
        an access token and keeps only the token — your password is never stored.
      </Text>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            keyboardType="email-address"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            placeholder="Serializd email"
            value={field.value}
          />
        )}
      />
      {errors.email != null && (
        <Text className="text-accent font-sans text-xs">{errors.email.message}</Text>
      )}
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            onSubmitEditing={() => submit()}
            placeholder="Password"
            returnKeyType="done"
            secureTextEntry
            value={field.value}
          />
        )}
      />
      {errors.password != null && (
        <Text className="text-accent font-sans text-xs">{errors.password.message}</Text>
      )}
      {login.error != null && (
        <Text className="text-accent font-sans text-xs">{loginErrorText(login.error.message)}</Text>
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
