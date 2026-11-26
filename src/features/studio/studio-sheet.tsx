import { Button } from '@/components/button';
import { Eyebrow } from '@/components/eyebrow';
import { ShareButton } from '@/components/share-button';
import { Sheet } from '@/components/sheet';
import { SheetHeader } from '@/components/sheet-header';
import { StudioLinksSection } from '@/features/provider-links/studio-links-section';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedStudio } from '@/types/media';

interface StudioSheetProps {
  studio: NormalizedStudio | null;
  open: boolean;
  onClose: () => void;
}

export function StudioSheet({ studio, open, onClose }: StudioSheetProps) {
  const pushRoute = usePushRoute();
  const canOpenStudio = useTmdbToken() !== '';
  const href =
    studio == null
      ? null
      : studio.tmdbId != null
        ? routes.studio(studio.tmdbId)
        : routes.studioLookup(studio.name);

  return (
    <Sheet onClose={onClose} open={open && studio != null}>
      {studio != null && href != null && (
        <>
          <SheetHeader>
            <SheetHeader.Content>
              <Eyebrow>Studio</Eyebrow>
              <SheetHeader.Title>{studio.name}</SheetHeader.Title>
            </SheetHeader.Content>
          </SheetHeader>

          {canOpenStudio && (
            <ShareButton.Capsule className="mt-6" href={href}>
              <Button
                icon={<Button.Icon name="business-outline" />}
                label="View studio"
                onPress={() => {
                  onClose();
                  pushRoute(href);
                }}
                variant="quiet"
              />
            </ShareButton.Capsule>
          )}

          <StudioLinksSection
            enabled={open}
            onOpened={onClose}
            studio={{
              name: studio.name,
              ...(studio.anilistId != null ? { anilistId: studio.anilistId } : {}),
            }}
            variant="rows"
          />
        </>
      )}
    </Sheet>
  );
}
