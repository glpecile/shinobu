import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { TextField } from '@/components/text-field';
import { Tooltip } from '@/components/tooltip';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { haptics } from '@/lib/haptics';
import { installLetterboxdScript } from '@/lib/install-letterboxd-script';
import { openExternalUrl } from '@/lib/open-external-url';
import { useLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import { PROVIDERS } from '@/lib/providers/registry';
import { routes } from '@/lib/routes';
import { toast } from '@/lib/toast';
import { useRenameList, type ListEditTarget } from '@/state/queries/list-membership';
import { useHasLetterboxdWriteSession } from '@/state/session/letterboxd';
import { ToolbarIcon } from './list-header';

function RenameForm({ target, onDone }: { target: ListEditTarget; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(target.title);
  const mutation = useRenameList(target);
  const hasSession = useHasLetterboxdWriteSession();
  const hasScript = useLetterboxdUserscript('list-rename');
  const needsScript = process.env.EXPO_OS === 'web' && target.provider === 'letterboxd' && !hasScript;
  const writable = target.provider !== 'letterboxd' || (process.env.EXPO_OS === 'web' ? hasScript : hasSession);
  const unchanged = name.trim() === '' || name.trim() === target.title;
  function save() {
    haptics.confirm();
    mutation.mutate(name, {
      onSuccess: (result) => {
        toast.success('List renamed', name.trim());
        onDone();
        // Letterboxd may give a renamed list a new address; the old one only redirects.
        if (result.provider === 'letterboxd' && target.provider === 'letterboxd' && result.slug !== target.slug) router.replace(routes.letterboxdList(result.owner, result.slug));
      },
      onError: () => haptics.error(),
    });
  }
  return (
    <WriteSheet.Step>
      <WriteSheet.Header><WriteSheet.Title>Rename list</WriteSheet.Title></WriteSheet.Header>
      <View className="mt-5">
        <TextField accessibilityLabel="Name" autoCapitalize="sentences" autoCorrect autoFocus editable={!mutation.isPending} onChangeText={setName} onSubmitEditing={() => { if (writable && !unchanged) save(); }} returnKeyType="done" value={name} />
      </View>
      {!writable && <WriteSheet.Description>{needsScript ? 'Install or update the Letterboxd script, then reload this tab to rename lists here.' : 'Reconnect Letterboxd with a signed-in session to rename lists here.'}</WriteSheet.Description>}
      {mutation.isError && <WriteSheet.Error>{mutation.error.message}</WriteSheet.Error>}
      <WriteSheet.Actions>
        {needsScript && <Button icon={<Button.Icon name="open-outline" />} label="Install Letterboxd script" onPress={installLetterboxdScript} />}
        {writable && <Button disabled={unchanged} icon={<Button.Icon name="checkmark" />} label={mutation.isError ? 'Try again' : 'Save name'} loading={mutation.isPending} loadingLabel="Saving…" onPress={save} />}
        {(!writable || mutation.isError) && <Button icon={<Button.Icon name="open-outline" />} label={`Open on ${PROVIDERS[target.provider].label}`} onPress={() => void openExternalUrl(target.url)} variant="quiet" />}
      </WriteSheet.Actions>
    </WriteSheet.Step>
  );
}

/** The owner's rename control for a list's toolbar, and the sheet it opens. Icon-only on a phone, where the toolbar can't fit its label. */
export function RenameList({ target }: { target: ListEditTarget }) {
  const [open, setOpen] = useState(false);
  const compact = useWindowDimensions().width < 640;
  return (
    <>
      {compact
        ? <ToolbarIcon><Tooltip label="Rename list"><Button icon={<Button.Icon name="create-outline" />} iconOnly label="Rename list" onPress={() => setOpen(true)} size="sm" variant="quiet" /></Tooltip></ToolbarIcon>
        : <Button icon={<Button.Icon name="create-outline" />} label="Rename" onPress={() => setOpen(true)} size="sm" variant="quiet" />}
      <Sheet autoFocus onClose={() => setOpen(false)} open={open}>
        {open && <RenameForm onDone={() => setOpen(false)} target={target} />}
      </Sheet>
    </>
  );
}
