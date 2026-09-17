import { type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Eyebrow } from '@/components/eyebrow';
import { SectionEnter } from '@/components/section-enter';
import { ProviderCard } from '@/features/trackers/provider-card';
import {
  shouldAutoCloseSheet,
  splitProviders,
} from '@/features/trackers/provider-connections';
import { ProviderSheet } from '@/features/trackers/provider-sheet';
import { TraktMigrationBanner } from '@/features/trackers/trakt-migration-banner';
import type { ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';

/**
 * The Manage Trackers screen's two provider sections, both driven by the
 * registry (AGENTS.md: adding a provider widens `PROVIDERS`, nothing else).
 *
 * Returns a fragment, not a wrapper `View`, so the screen's `gap-6` still sees
 * two independent sections — and an empty half costs no space at all.
 *
 * The provider sheet is hoisted here rather than living inside each card: one
 * `ModalBottomSheet` for the screen, opened on whichever provider was tapped
 * (`provider-sheet.tsx`).
 */
export function ProviderCardsSection() {
  const connectedIds = useConnectedProviders();
  const { connected, disconnected } = splitProviders(connectedIds);
  const [shownIds, setShownIds] = useState(connectedIds);
  const [movedIds, setMovedIds] = useState<ProviderId[]>([]);
  if (connectedIds !== shownIds) {
    setShownIds(connectedIds);
    setMovedIds([
      ...movedIds,
      ...connectedIds.filter((id) => !shownIds.includes(id)),
      ...shownIds.filter((id) => !connectedIds.includes(id)),
    ]);
  }
  // `sheetId` is kept while closing so the content doesn't vanish mid-animation
  // (the shape `card-actions-sheet` uses for its `item`).
  const [sheetId, setSheetId] = useState<ProviderId | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Whether the sheet was opened *to connect*. A sheet opened on an already
  // connected provider must not close itself the instant it appears.
  const [sheetWasConnected, setSheetWasConnected] = useState(false);

  function openSheet(id: ProviderId) {
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

  return (
    <>
      {/* MigrationNeeded (plan 0034 U9): a Trakt token with no credentials is
          gated out of `connectedIds`, so the card below reads disconnected —
          this banner is what explains that, and its action opens the same
          sheet (the guided BYO wizard) the card would. */}
      <TraktMigrationBanner onReconnect={() => openSheet('trakt')} />

      {connected.length > 0 && (
        <View>
          <Eyebrow className="mb-3">Connected</Eyebrow>
          <View className="gap-3">
            {connected.map((id) => (
              <MovedCard key={id} moved={movedIds.includes(id)}>
                <ProviderCard
                  connected
                  id={id}
                  onOpenSheet={() => openSheet(id)}
                />
              </MovedCard>
            ))}
          </View>
        </View>
      )}

      {disconnected.length > 0 && (
        <View>
          <Eyebrow className="mb-3">Accounts</Eyebrow>
          <View className="gap-3">
            {disconnected.map((id) => (
              <MovedCard key={id} moved={movedIds.includes(id)}>
                <ProviderCard
                  connected={false}
                  id={id}
                  onOpenSheet={() => openSheet(id)}
                />
              </MovedCard>
            ))}
          </View>
        </View>
      )}

      <ProviderSheet
        connected={sheetWasConnected}
        id={sheetId}
        onClose={() => setSheetOpen(false)}
        open={sheetOpen}
      />
    </>
  );
}

/** Settles a card into the section it just moved to during this visit. */
function MovedCard({
  moved,
  children,
}: {
  moved: boolean;
  children: ReactNode;
}) {
  return moved ? <SectionEnter>{children}</SectionEnter> : children;
}
