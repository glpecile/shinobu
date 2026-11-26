import { type ReactNode, useEffect, useState } from 'react';

import { RailHead } from '@/components/rail-head';
import { SectionEnter } from '@/components/section-enter';
import { SettingsRail } from '@/features/settings/settings-rail';
import { ProviderCard } from '@/features/trackers/provider-card';
import { shouldAutoCloseSheet, splitProviders } from '@/features/trackers/provider-connections';
import { ProviderSheet } from '@/features/trackers/provider-sheet';
import { haptics } from '@/lib/haptics';
import { Provider, type ProviderId } from '@/lib/providers/types';
import {
  SERVER_CONNECTED_PROVIDERS,
  useConnectedProviders,
  useHardcoverNeedsReconnect,
  useTraktNeedsCredentials,
} from '@/state/session';

export function ProviderCardsSection() {
  const connectedIds = useConnectedProviders();
  const traktNeedsCredentials = useTraktNeedsCredentials();
  const hardcoverNeedsReconnect = useHardcoverNeedsReconnect();
  const { connected, disconnected } = splitProviders(connectedIds);
  const [shownIds, setShownIds] = useState(connectedIds);
  const [movedIds, setMovedIds] = useState<ProviderId[]>([]);
  if (connectedIds !== shownIds) {
    setShownIds(connectedIds);
    if (shownIds !== SERVER_CONNECTED_PROVIDERS) {
      setMovedIds([
        ...movedIds,
        ...connectedIds.filter((id) => !shownIds.includes(id)),
        ...shownIds.filter((id) => !connectedIds.includes(id)),
      ]);
    }
  }
  const [sheetId, setSheetId] = useState<ProviderId | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetWasConnected, setSheetWasConnected] = useState(false);

  function openSheet(id: ProviderId) {
    haptics.selection();
    setSheetId(id);
    setSheetWasConnected(connectedIds.includes(id));
    setSheetOpen(true);
  }

  const autoClose = shouldAutoCloseSheet({
    open: sheetOpen,
    sheetId,
    openedConnected: sheetWasConnected,
    connectedIds,
  });
  useEffect(() => {
    if (autoClose) setSheetOpen(false);
  }, [autoClose]);

  function reconnectReason(id: ProviderId): string | undefined {
    switch (id) {
      case Provider.Trakt:
        return traktNeedsCredentials ? 'Trakt now needs your own API app.' : undefined;
      case Provider.Hardcover:
        return hardcoverNeedsReconnect ? "Hardcover's sign-in expired." : undefined;
      default:
        return undefined;
    }
  }

  const count = `${connected.length} of ${connected.length + disconnected.length} connected`;

  return (
    <>
      <SettingsRail.Section count={count} icon="link-outline" title="Trackers">
        <SettingsRail.Head label={`Trackers, ${count}`}>
          <RailHead.Icon name="link-outline">Trackers</RailHead.Icon>
          <RailHead.Count>{count}</RailHead.Count>
        </SettingsRail.Head>
        {[...connected, ...disconnected].map((id) => (
          <MovedCard key={id} moved={movedIds.includes(id)}>
            <ProviderCard
              connected={connected.includes(id)}
              id={id}
              onOpenSheet={() => openSheet(id)}
              reconnectReason={reconnectReason(id)}
            />
          </MovedCard>
        ))}
      </SettingsRail.Section>

      <ProviderSheet
        connected={sheetWasConnected}
        id={sheetId}
        onClose={() => setSheetOpen(false)}
        open={sheetOpen}
      />
    </>
  );
}

function MovedCard({ moved, children }: { moved: boolean; children: ReactNode }) {
  return moved ? <SectionEnter>{children}</SectionEnter> : children;
}
