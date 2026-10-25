import { type ReactNode, useEffect, useState } from 'react';

import { RailHead } from '@/components/rail-head';
import { SectionEnter } from '@/components/section-enter';
import { SettingsRail } from '@/features/settings/settings-rail';
import { ProviderCard } from '@/features/trackers/provider-card';
import {
  shouldAutoCloseSheet,
  splitProviders,
} from '@/features/trackers/provider-connections';
import { ProviderSheet } from '@/features/trackers/provider-sheet';
import { haptics } from '@/lib/haptics';
import type { ProviderId } from '@/lib/providers/types';
import {
  SERVER_CONNECTED_PROVIDERS,
  useConnectedProviders,
  useTraktNeedsCredentials,
} from '@/state/session';

/**
 * The Settings screen's Trackers section: every provider in the registry
 * (AGENTS.md: adding a provider widens `PROVIDERS`, nothing else), connected
 * first, then available.
 *
 * The provider sheet is hoisted here rather than living inside each card: one
 * `ModalBottomSheet` for the screen, opened on whichever provider was tapped
 * (`provider-sheet.tsx`).
 */
export function ProviderCardsSection() {
  const connectedIds = useConnectedProviders();
  const traktNeedsCredentials = useTraktNeedsCredentials();
  const { connected, disconnected } = splitProviders(connectedIds);
  const [shownIds, setShownIds] = useState(connectedIds);
  const [movedIds, setMovedIds] = useState<ProviderId[]>([]);
  if (connectedIds !== shownIds) {
    setShownIds(connectedIds);
    // Web hydration swapping in the real sessions isn't the user moving a card.
    if (shownIds !== SERVER_CONNECTED_PROVIDERS) {
      setMovedIds([
        ...movedIds,
        ...connectedIds.filter((id) => !shownIds.includes(id)),
        ...shownIds.filter((id) => !connectedIds.includes(id)),
      ]);
    }
  }
  // `sheetId` is kept while closing so the content doesn't vanish mid-animation
  // (the shape `card-actions-sheet` uses for its `item`).
  const [sheetId, setSheetId] = useState<ProviderId | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Whether the sheet was opened *to connect*. A sheet opened on an already
  // connected provider must not close itself the instant it appears.
  const [sheetWasConnected, setSheetWasConnected] = useState(false);

  function openSheet(id: ProviderId) {
    haptics.selection();
    setSheetId(id);
    setSheetWasConnected(connectedIds.includes(id));
    setSheetOpen(true);
  }

  // The decision itself is a pure function, unit-tested in
  // provider-connections.test.ts; this effect only applies it.
  const autoClose = shouldAutoCloseSheet({
    open: sheetOpen,
    sheetId,
    openedConnected: sheetWasConnected,
    connectedIds,
  });
  useEffect(() => {
    if (autoClose) setSheetOpen(false);
  }, [autoClose]);

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
              reconnect={id === 'trakt' && traktNeedsCredentials}
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

/** Settles a row into the place it just moved to during this visit. */
function MovedCard({
  moved,
  children,
}: {
  moved: boolean;
  children: ReactNode;
}) {
  return moved ? <SectionEnter>{children}</SectionEnter> : children;
}
