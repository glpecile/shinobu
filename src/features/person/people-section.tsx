import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { PresstableOpacity, PresstableScale } from '@/components/presstable';
import { Rail } from '@/components/rail';
import { Section } from '@/components/section';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { usePushRoute } from '@/lib/navigation';
import { useThemeColor } from '@/lib/theme-color';
import { useTmdbToken } from '@/state/session/tmdb-token';

import { PersonAvatar } from './person-avatar';
import { creditRoute, type PersonCredit } from './person-credit-sheet';

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
        <Text
          className="text-muted font-sans text-xs text-center mt-0.5"
          numberOfLines={2}
        >
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
  const accentForeground = useThemeColor('--color-accent-foreground');
  // JS hover state, not CSS: uniwind has no `group-hover:` support, so the
  // web-only ⋯ reveal rides on RN-web's pointer events instead (same shape as
  // the media card's).
  const [hovered, setHovered] = useState(false);
  const showActionsButton = process.env.EXPO_OS === 'web' && hovered;

  const content = <PersonCardContent credit={credit} />;

  return (
    // The ⋯ is a *sibling* of the pressable, not a child — nesting two
    // gesture-handler buttons would let a ⋯ press bubble into the card press.
    <View
      className="w-24 mr-4 relative"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {onPress == null ? (
        // No TMDB token means no person page to open, but the credit sheet
        // still has the full role to show, so the card stays pressable.
        <PresstableScale
          className="items-center"
          onPress={() => onActions(credit)}
        >
          {content}
        </PresstableScale>
      ) : (
        <PresstableScale
          className="items-center"
          onLongPress={() => onActions(credit)}
          onPress={onPress}
        >
          {content}
        </PresstableScale>
      )}
      {showActionsButton && (
        <PresstableOpacity
          accessibilityLabel={`More about ${credit.name}`}
          accessibilityRole="button"
          className="absolute top-0 right-0 w-7 h-7 items-center justify-center rounded-full bg-black/70"
          onPress={() => onActions(credit)}
        >
          <Ionicons
            color={
              accentForeground
            }
            name="ellipsis-horizontal"
            size={14}
          />
        </PresstableOpacity>
      )}
    </View>
  );
}

/**
 * A rail of credit cards. Without `onCreditActions` the cards are display-only:
 * AniList characters, which have no person behind them to open.
 */
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
  // No TMDB token, no TMDB person pages — AniList people still open theirs.
  const hasTmdb = useTmdbToken() !== '';

  if (people.length === 0) return null;

  return (
    <Section>
      <Section.Header>
        <Section.Title>{title}</Section.Title>
      </Section.Header>
      <Rail>
        {people.map((credit) =>
          onCreditActions == null ? (
            <View className="w-24 mr-4 items-center" key={credit.id}>
              <PersonCardContent credit={credit} />
            </View>
          ) : (
            <PersonCard
              credit={credit}
              key={credit.id}
              onActions={onCreditActions}
              {...(hasTmdb || credit.anilistId != null
                ? { onPress: () => pushRoute(creditRoute(credit)) }
                : {})}
            />
          ),
        )}
      </Rail>
    </Section>
  );
}

export function PeopleRailSkeleton() {
  return (
    <View className="mt-8">
      <Skeleton className="h-6 w-24 rounded mb-4" />
      {/* Enough cards to overflow any viewport up to the max-w-4xl container;
          overflow-hidden clips the excess, reading as an off-screen carousel. */}
      <View className="flex-row overflow-hidden">
        {Array.from({ length: 10 }).map((_, index) => (
          <View className="w-24 items-center mr-4" key={index}>
            <Skeleton
              className="w-20 h-20 rounded-full"
              delay={staggerDelay(index)}
            />
            <Skeleton
              className="h-3 w-16 rounded mt-2"
              delay={staggerDelay(index)}
            />
            <Skeleton
              className="h-2.5 w-12 rounded mt-1.5"
              delay={staggerDelay(index)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

/** One rail per section behind the boundary (Cast + Crew). */
export function PeopleSectionsSkeleton() {
  return (
    <>
      <PeopleRailSkeleton />
      <PeopleRailSkeleton />
    </>
  );
}
