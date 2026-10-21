import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { ButtonCapsule } from '@/components/button-capsule';
import { shareLink } from '@/components/share-button';
import { Sheet } from '@/components/sheet';
import { SheetHeader } from '@/components/sheet-header';
import { Tooltip } from '@/components/tooltip';
import { haptics } from '@/lib/haptics';
import { usePushRoute } from '@/lib/navigation';
import { PROVIDERS } from '@/lib/providers/registry';
import { hideList } from '@/state/prefs/hidden-items';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { ProviderListLink } from './list-header';
import { ListLikeButton } from './list-like-button';
import { listMeta, type ListSummary } from './list-summary';
import { PosterStack } from './poster-stack';

/** The sheet's state for a screen of list cards; `list` survives closing so it never empties mid-animation. */
export function useListSheet() {
  const [list, setList] = useState<ListSummary | null>(null);
  const [open, setOpen] = useState(false);
  return {
    openList: (next: ListSummary) => { haptics.selection(); setList(next); setOpen(true); },
    sheetProps: { list, open, onClose: () => setOpen(false) },
  };
}

/**
 * A list card's long-press: what the clamped card cut off, then where to go.
 * Like appears only for another member's Letterboxd list, as on its page.
 * Hide drops it from rails and grids until unhidden in Settings.
 */
export function ListSheet({ list, open, onClose }: { list: ListSummary | null; open: boolean; onClose: () => void }) {
  const pushRoute = usePushRoute();
  const letterboxdUsername = useConnectedProviders().includes('letterboxd') ? getLetterboxdUsername() : null;
  return (
    <Sheet onClose={onClose} open={open && list != null}>
      {list != null && (
        <>
          <SheetHeader>
            <SheetHeader.Content>
              <SheetHeader.Eyebrow tone="muted">{`${PROVIDERS[list.provider].label} list`}</SheetHeader.Eyebrow>
              <SheetHeader.Title numberOfLines={0}>{list.title}</SheetHeader.Title>
              <SheetHeader.Subtitle>{listMeta(list)}</SheetHeader.Subtitle>
            </SheetHeader.Content>
          </SheetHeader>
          <PosterStack className="mt-5 max-w-md self-center" previews={list.previews} />
          <View className="mt-6 gap-3">
            <Button icon={<Button.Icon name="list-outline" />} label="Open list" onPress={() => { haptics.selection(); onClose(); pushRoute(list.href); }} variant="quiet" />
            <View className="flex-row items-center gap-2">
              <View className="flex-1"><ProviderListLink provider={list.provider} url={list.url} /></View>
              <ButtonCapsule>
                {list.provider === 'letterboxd' && letterboxdUsername != null && (
                  <ListLikeButton owner={list.owner} size="md" slug={list.slug} url={list.url} username={letterboxdUsername} variant="ghost" />
                )}
                <Tooltip label="Share">
                  <Button icon={<Button.Icon name="share-outline" />} iconOnly label="Share" onPress={() => { haptics.selection(); void shareLink(list.href); }} variant="ghost" />
                </Tooltip>
              </ButtonCapsule>
            </View>
            <Button
              icon={<Button.Icon name="eye-off-outline" />}
              label="Hide list"
              onPress={() => {
                haptics.confirm();
                hideList({ id: list.href, title: list.title });
                onClose();
              }}
              variant="quiet"
            />
          </View>
        </>
      )}
    </Sheet>
  );
}
