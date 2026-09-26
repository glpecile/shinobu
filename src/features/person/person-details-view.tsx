import { Text, View } from 'react-native';

import { ExpandableText } from '@/components/expandable-text';
import Head from '@/components/head';
import { useFloatingBackButtonClearance } from '@/components/floating-back-button';
import { ScrolledTitle } from '@/components/scrolled-title';
import { ZoomableImage } from '@/components/zoomable-image';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { CopyTitle } from '@/features/copy-title/copy-title';
import { CreditTimeline } from '@/features/credit-timeline/credit-timeline';
import { mergeCreditRows } from '@/features/credit-timeline/group';
import { PersonLinksSection } from '@/features/provider-links/person-links-section';
import { initials } from '@/lib/initials';
import { usePushRoute } from '@/lib/navigation';
import { ACTING_ROLE } from '@/lib/providers/tmdb/normalize';
import type { NormalizedPersonDetails } from '@/lib/providers/tmdb/normalize';
import { routes } from '@/lib/routes';

import { personMetaLine } from './meta-line';

/**
 * The person page itself, shared by `/person/[id]` and `/person/lookup` — the
 * two differ only in how the details were fetched.
 */
export function PersonDetailsView({ person, rows }: NormalizedPersonDetails) {
  const headerTop = useFloatingBackButtonClearance();
  const pushRoute = usePushRoute();
  const meta = personMetaLine(person);
  // Same per-card actions dialog as the home feed.
  const { openActions, sheetProps } = useCardActions();
  const filmography = mergeCreditRows(rows);

  return (
    <>
      <Head>
        <title>{`${person.name} — Shinobu`}</title>
        {person.biography != null && (
          <meta content={person.biography} name="description" />
        )}
      </Head>
      <CreditTimeline
        filmography={filmography}
        footer={
          <View className="px-6">
            <PersonLinksSection person={person} />
          </View>
        }
        header={
          <View className="px-6" style={{ paddingTop: headerTop }}>
            <View className="flex-row items-center gap-5 mb-6">
              {person.headshot !== '' ? (
                <ZoomableImage
                  alt={person.name}
                  uri={person.headshot}
                  zoomUri={person.headshotFull}
                  type="circle-avi"
                  className="w-28 h-28 rounded-full bg-surface border border-border"
                  contentFit="cover"
                />
              ) : (
                <View className="w-28 h-28 rounded-full bg-surface border border-border items-center justify-center">
                  <Text className="text-muted font-sans-semibold text-3xl">
                    {initials(person.name)}
                  </Text>
                </View>
              )}
              <View className="flex-1">
                <ScrolledTitle.Anchor>
                  <CopyTitle title={person.name} tmdbId={person.tmdbId} />
                </ScrolledTitle.Anchor>
                {meta !== '' && (
                  <Text className="text-muted font-sans text-sm mt-1.5">{meta}</Text>
                )}
              </View>
            </View>
            {person.biography != null && (
              <ExpandableText
                lines={4}
                linkedText={person.biographyMarkdown}
                text={person.biography}
                title="Biography"
              />
            )}
          </View>
        }
        // The row clamps the roles to one line, so the long-press carries the
        // whole of it into the sheet, with the face: "who is this person
        // here?" without leaving the page. A title held only as a character
        // reads "as …"; one that mixes in a crew job reads as the job list.
        onItemActions={(credit, roles) =>
          openActions(credit.item, {
            name: person.name,
            headshot: person.headshot,
            role: roles,
            kind: credit.roles.every((entry) => entry.role === ACTING_ROLE) ? 'cast' : 'crew',
          })
        }
        onItemPress={(item) => pushRoute(routes.details(item.id))}
      />
      <ScrolledTitle.Bar title={person.name} />
      <CardActionsSheet {...sheetProps} />
    </>
  );
}
