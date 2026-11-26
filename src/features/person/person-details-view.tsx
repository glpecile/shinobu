import { Text, View } from 'react-native';
import { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { ExpandableText } from '@/components/expandable-text';
import Head from '@/components/head';
import { useFloatingBackButtonClearance } from '@/components/floating-back-button';
import { FloatingShareButton } from '@/components/floating-share-button';
import { ScrolledTitle } from '@/components/scrolled-title';
import { ZoomableImage } from '@/components/zoomable-image';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { CopyTitle } from '@/features/copy-title/copy-title';
import { CreditTimeline } from '@/features/credit-timeline/credit-timeline';
import { mergeCreditRows } from '@/features/credit-timeline/group';
import { PersonLinksSection } from '@/features/provider-links/person-links-section';
import { initials } from '@/lib/initials';
import { DURATION, KEYFRAME_EASE_OUT } from '@/lib/motion';
import { usePushRoute } from '@/lib/navigation';
import { ACTING_ROLE } from '@/lib/providers/tmdb/normalize';
import type { NormalizedPersonDetails } from '@/lib/providers/tmdb/normalize';
import { routes } from '@/lib/routes';

import { personMetaLine } from './meta-line';
import { creditRoute } from './person-credit-sheet';

const personEntering = [0, 40, 80].map((delay) =>
  FadeIn.duration(DURATION.enter).easing(KEYFRAME_EASE_OUT).delay(delay),
);

export function PersonDetailsView({ person, rows, tvCredits }: NormalizedPersonDetails) {
  const headerTop = useFloatingBackButtonClearance();
  const reduceMotion = useReducedMotion();
  const pushRoute = usePushRoute();
  const meta = personMetaLine(person);
  const { openActions, sheetProps } = useCardActions();
  const filmography = mergeCreditRows(rows);

  return (
    <>
      <Head>
        <title>{`${person.name} — Shinobu`}</title>
        {person.biography != null && <meta content={person.biography} name="description" />}
      </Head>
      <CreditTimeline
        filmography={filmography}
        sectionEntering={reduceMotion ? undefined : personEntering[2]}
        footer={
          <View className="px-6">
            <PersonLinksSection person={person} />
          </View>
        }
        header={
          <View className="px-6" style={{ paddingTop: headerTop }}>
            <AnimatedView
              className="flex-row items-center gap-5 mb-6"
              entering={reduceMotion ? undefined : personEntering[0]}
            >
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
              <View className="flex-1 min-w-0">
                <ScrolledTitle.Anchor>
                  <CopyTitle title={person.name} tmdbId={person.tmdbId} />
                </ScrolledTitle.Anchor>
                {meta !== '' && <Text className="text-muted font-sans text-sm mt-1.5">{meta}</Text>}
              </View>
            </AnimatedView>
            {person.biography != null && (
              <AnimatedView entering={reduceMotion ? undefined : personEntering[1]}>
                <ExpandableText
                  className="min-h-40"
                  lines={4}
                  markdown={person.biographyMarkdown}
                  text={person.biography}
                  title="Biography"
                />
              </AnimatedView>
            )}
          </View>
        }
        onItemActions={(credit, roles) =>
          openActions(credit.item, {
            name: person.name,
            headshot: person.headshot,
            role: roles,
            kind: credit.roles.every((entry) => entry.role === ACTING_ROLE) ? 'cast' : 'crew',
            tvCredits: tvCredits?.[credit.item.id],
          })
        }
        onItemPress={(item) => pushRoute(routes.details(item.id, item.type))}
      />
      <ScrolledTitle.Bar title={person.name} trailingAction />
      <FloatingShareButton href={creditRoute(person)} />
      <CardActionsSheet {...sheetProps} />
    </>
  );
}
