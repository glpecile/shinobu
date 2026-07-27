import { useState } from 'react';
import { Text, View } from 'react-native';

import { ProviderCard } from '@/features/trackers/provider-card';
import { splitProviders } from '@/features/trackers/provider-connections';
import { ProviderSheet } from '@/features/trackers/provider-sheet';
import type { ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider mb-3">
      {children}
    </Text>
  );
}

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
  const { connected, disconnected } = splitProviders(useConnectedProviders());
  // `sheetId` is kept while closing so the content doesn't vanish mid-animation
  // (the shape `card-actions-sheet` uses for its `item`).
  const [sheetId, setSheetId] = useState<ProviderId | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function openSheet(id: ProviderId) {
    setSheetId(id);
    setSheetOpen(true);
  }

  return (
    <>
      {connected.length > 0 && (
        <View>
          <SectionLabel>Connected</SectionLabel>
          <View className="gap-3">
            {connected.map((id) => (
              <ProviderCard
                connected
                id={id}
                key={id}
                onOpenSheet={() => openSheet(id)}
              />
            ))}
          </View>
        </View>
      )}

      {disconnected.length > 0 && (
        <View>
          <SectionLabel>Accounts</SectionLabel>
          <View className="gap-3">
            {disconnected.map((id) => (
              <ProviderCard
                connected={false}
                id={id}
                key={id}
                onOpenSheet={() => openSheet(id)}
              />
            ))}
          </View>
        </View>
      )}

      <ProviderSheet
        id={sheetId}
        onClose={() => setSheetOpen(false)}
        open={sheetOpen}
      />
    </>
  );
}
