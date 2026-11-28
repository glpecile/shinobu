import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ShareButton } from '@/components/share-button';
import { Sheet } from '@/components/sheet';
import { SheetHeader } from '@/components/sheet-header';
import { Skeleton } from '@/components/skeleton';
import { PersonLinksSection } from '@/features/provider-links/person-links-section';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useTmdbPersonQuery } from '@/state/queries/tmdb';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedPerson } from '@/types/media';

import { personMetaLine } from './meta-line';
import { PersonAvatar } from './person-avatar';

export function creditRoleLine(credit: { role: string; kind: 'cast' | 'crew' }): string {
  if (credit.role === '') return credit.kind === 'cast' ? 'Cast' : 'Crew';
  return credit.kind === 'cast' ? `as ${credit.role}` : credit.role;
}

export function creditRoute(
  credit: Pick<PersonCredit, 'name' | 'tmdbId' | 'anilistId' | 'hardcoverId'>,
) {
  if (credit.tmdbId != null) return routes.person(credit.tmdbId);
  if (credit.anilistId != null) return routes.anilistPerson(credit.anilistId);
  if (credit.hardcoverId != null) return routes.hardcoverAuthor(credit.hardcoverId);
  return routes.personLookup(credit.name);
}

export interface PersonCredit {
  id: string;
  name: string;
  role: string;
  kind: 'cast' | 'crew';
  headshot: string;
  tmdbId?: number;
  anilistId?: number;
  hardcoverId?: number;
}

function CreditMeta({
  person,
  loading,
}: {
  person: NormalizedPerson | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <View className="mt-5">
        <Skeleton className="h-5 w-2/3 rounded" />
      </View>
    );
  }

  if (person == null) return null;
  const meta = personMetaLine(person);
  if (meta === '') return null;

  return <Text className="text-muted font-sans text-sm mt-5">{meta}</Text>;
}

interface PersonCreditSheetProps {
  credit: PersonCredit | null;
  open: boolean;
  onClose: () => void;
}

export function PersonCreditSheet({ credit, open, onClose }: PersonCreditSheetProps) {
  const pushRoute = usePushRoute();
  const hasTmdb = useTmdbToken() !== '';
  const personQuery = useTmdbPersonQuery({
    tmdbId: credit?.tmdbId,
    enabled: open && hasTmdb,
  });
  const person = personQuery.data?.person;

  return (
    <Sheet onClose={onClose} open={open && credit != null}>
      {credit != null && (
        <>
          <SheetHeader>
            <PersonAvatar
              className="w-20 h-20"
              headshot={credit.headshot}
              name={credit.name}
              textClassName="text-xl"
            />
            <SheetHeader.Content>
              <SheetHeader.Title>{credit.name}</SheetHeader.Title>
              <SheetHeader.Subtitle>{creditRoleLine(credit)}</SheetHeader.Subtitle>
            </SheetHeader.Content>
          </SheetHeader>

          <CreditMeta
            loading={credit.tmdbId != null && hasTmdb && personQuery.isPending}
            person={person}
          />

          {(hasTmdb || credit.anilistId != null) && (
            <ShareButton.Capsule className="mt-5" href={creditRoute(credit)}>
              <Button
                icon={<Button.Icon name="person-outline" />}
                label="View filmography"
                onPress={() => {
                  onClose();
                  pushRoute(creditRoute(credit));
                }}
                variant="quiet"
              />
            </ShareButton.Capsule>
          )}

          <PersonLinksSection
            enabled={open}
            onOpened={onClose}
            person={{
              name: credit.name,
              ...(credit.anilistId != null ? { anilistId: credit.anilistId } : {}),
              ...(person?.knownForDepartment != null
                ? { knownForDepartment: person.knownForDepartment }
                : credit.kind === 'cast'
                  ? { knownForDepartment: 'Acting' }
                  : {}),
            }}
            variant="rows"
          />
        </>
      )}
    </Sheet>
  );
}
