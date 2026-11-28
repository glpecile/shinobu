import { Text, View } from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';

import { OverlayActionsButton } from '@/components/overlay-actions-button';
import { PresstableScale } from '@/components/presstable';
import { VirtualizedRail } from '@/components/rail';
import { Section } from '@/components/section';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { usePointerHover } from '@/components/use-pointer-hover';
import { usePushRoute } from '@/lib/navigation';
import { useTmdbToken } from '@/state/session/tmdb-token';

import { PersonAvatar } from './person-avatar';
import { creditRoute, type PersonCredit } from './person-credit-sheet';

// Avatar plus name and two scaled role lines
const railHeight = (fontScale: number) => 90 + 48 * fontScale;

function PersonCardContent({ credit }: { credit: PersonCredit }) {
  return (
    <>
      <PersonAvatar
        className="w-20 h-20 bg-surface"
        headshot={credit.headshot}
        name={credit.name}
        textClassName="text-lg"
      />
      <Text
        className="text-foreground font-sans-semibold text-xs text-center mt-2"
        numberOfLines={1}
      >
        {credit.name}
      </Text>
      {credit.role !== '' && (
        <Text className="text-muted font-sans text-xs text-center mt-0.5" numberOfLines={2}>
          {credit.role}
        </Text>
      )}
    </>
  );
}

function PersonCard({
  credit,
  onPress,
  onActions,
}: {
  credit: PersonCredit;
  onPress?: () => void;
  onActions: (credit: PersonCredit) => void;
}) {
  const { hovered, hoverProps } = usePointerHover();

  const content = <PersonCardContent credit={credit} />;

  return (
    // Sibling, not child: nested gesture-handler buttons bubble presses into the card.
    <View
      className="w-24 mr-4 relative"
      {...hoverProps}
    >
      {onPress == null ? (
        <PresstableScale
          accessibilityLabel={`${credit.name} / ${credit.role}`}
          className="items-center"
          onPress={() => onActions(credit)}
        >
          {content}
        </PresstableScale>
      ) : (
        <PresstableScale
          accessibilityLabel={`${credit.name} / ${credit.role}`}
          className="items-center"
          onLongPress={() => onActions(credit)}
          onPress={onPress}
        >
          {content}
        </PresstableScale>
      )}
      {process.env.EXPO_OS === 'web' && (
        <OverlayActionsButton
          className="absolute top-0 right-0"
          label={`More about ${credit.name}`}
          onPress={() => onActions(credit)}
          size="lg"
          visible={hovered}
        />
      )}
    </View>
  );
}

export function PeopleSection({
  title,
  people,
  onCreditActions,
}: {
  title: string;
  people: PersonCredit[];
  onCreditActions?: (credit: PersonCredit) => void;
}) {
  const pushRoute = usePushRoute();
  const { fontScale } = useWindowDimensions();
  const hasTmdb = useTmdbToken() !== '';

  if (people.length === 0) return null;

  return (
    <Section>
      <Section.Header>
        <Section.Title>{title}</Section.Title>
      </Section.Header>
      <VirtualizedRail
        data={people}
        estimatedItemSize={112}
        keyExtractor={(credit) => credit.id}
        renderItem={({ item: credit }) =>
          onCreditActions == null ? (
            credit.hardcoverId == null ? (
              <View className="w-24 mr-4 items-center">
                <PersonCardContent credit={credit} />
              </View>
            ) : (
              <View className="w-24 mr-4">
                <PresstableScale
                  accessibilityLabel={
                    credit.role === '' ? credit.name : `${credit.name} / ${credit.role}`
                  }
                  className="items-center"
                  onPress={() => pushRoute(creditRoute(credit))}
                >
                  <PersonCardContent credit={credit} />
                </PresstableScale>
              </View>
            )
          ) : (
            <PersonCard
              credit={credit}
              onActions={onCreditActions}
              {...(hasTmdb || credit.anilistId != null
                ? { onPress: () => pushRoute(creditRoute(credit)) }
                : {})}
            />
          )
        }
        style={{ height: railHeight(fontScale) }}
      />
    </Section>
  );
}

export function PeopleRailSkeleton() {
  const { fontScale } = useWindowDimensions();
  return (
    <View className="mt-8 pointer-fine:pb-3">
      <Skeleton className="h-7 w-24 rounded mb-4" />
      <View className="flex-row overflow-hidden" style={{ height: railHeight(fontScale) }}>
        {Array.from({ length: 10 }).map((_, index) => (
          <View className="w-24 items-center mr-4" key={index}>
            <Skeleton className="w-20 h-20 rounded-full" delay={staggerDelay(index)} />
            <Skeleton className="h-3 w-16 rounded mt-2" delay={staggerDelay(index)} />
            <Skeleton className="h-2.5 w-12 rounded mt-1.5" delay={staggerDelay(index)} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function PeopleSectionsSkeleton() {
  return (
    <>
      <PeopleRailSkeleton />
      <PeopleRailSkeleton />
    </>
  );
}
