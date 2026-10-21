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
  /** Kept (not nulled) while closing so content doesn't vanish mid-animation. */
  studio: NormalizedStudio | null;
  open: boolean;
  onClose: () => void;
}

/**
 * The long-press dialog behind a studio pill (plan 0035 R8) — the affordance
 * people have had since plan 0028 and studios did not. That plan's scope
 * boundary said studio pills had "nothing to expand"; they do: the provider
 * pages the studio has, which a plain press (still navigation) can't offer.
 *
 * Deliberately thin. `NormalizedStudio` carries a name and two ids and no logo
 * or description, so inventing a header for one would mean fetching something
 * this sheet does not have — the name, the route and the links are the whole
 * payload until the type grows.
 */
export function StudioSheet({ studio, open, onClose }: StudioSheetProps) {
  const pushRoute = usePushRoute();
  // Same gate as the pills themselves: no TMDB token, no studio route.
  const canOpenStudio = useTmdbToken() !== '';
  const href = studio == null ? null : studio.tmdbId != null ? routes.studio(studio.tmdbId) : routes.studioLookup(studio.name);

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
