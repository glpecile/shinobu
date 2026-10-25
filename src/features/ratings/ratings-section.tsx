import { Text, View } from 'react-native';

import { LinkPill } from '@/components/link-pill';
import { ProviderIcon } from '@/components/provider-icon';
import { Section } from '@/components/section';
import { SuspenseSection } from '@/components/suspense-section';
import { formatCount } from '@/lib/format-count';
import { openExternalUrl } from '@/lib/open-external-url';
import { ratingUrl, tmdbItemUrl, type UrlEpisode } from '@/lib/providers/external-urls';
import { providerLinksFor } from '@/lib/providers/provider-links';
import { PROVIDERS } from '@/lib/providers/registry';
import { providersForRatings } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import { useSuspenseAniListRelationsQuery } from '@/state/queries/anilist';
import { useSuspenseLetterboxdFilmQuery, useSuspenseLetterboxdSlugQuery } from '@/state/queries/letterboxd';
import { useSuspenseSimklRatingsQuery } from '@/state/queries/simkl';
import { useSuspenseWikidataRatingsQuery } from '@/state/queries/wikidata';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem, NormalizedRating, RatingSource } from '@/types/media';

const SOURCE_NAMES: Record<RatingSource, string> = {
  tmdb: 'TMDB',
  simkl: 'Simkl',
  imdb: 'IMDb',
  mal: 'MyAnimeList',
  anilist: 'AniList',
  letterboxd: 'Letterboxd',
  rottenTomatoes: 'Rotten Tomatoes',
  metacritic: 'Metacritic',
};

// UTC: a bare `YYYY-MM-DD` parses at UTC midnight, so the month can't shift west of Greenwich.
const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Wikidata's "as of" date as a month: Nov 2022. */
function asOfMonth(asOf: string): string {
  const date = new Date(asOf);
  return Number.isNaN(date.getTime()) ? asOf : monthFormatter.format(date);
}

/** The score as its source writes it: 8.8, 4.24, 87%, 74. */
function scoreText(rating: NormalizedRating): string {
  switch (rating.scale) {
    case 10: return rating.value.toFixed(1);
    case 5: return rating.value.toFixed(2);
    case 100: return String(Math.round(rating.value));
    case '%': return `${Math.round(rating.value)}%`;
  }
}

/** "IMDb 8.8 out of 10, 2.9M votes": the source, score and scale read aloud. */
function spokenRating(rating: NormalizedRating): string {
  return [
    `${SOURCE_NAMES[rating.source]} ${scoreText(rating)}${rating.scale === '%' ? '' : ` out of ${rating.scale}`}`,
    ...(rating.votes != null ? [`${formatCount(rating.votes)} votes`] : []),
    ...(rating.rank != null ? [`ranked ${rating.rank}`] : []),
    ...(rating.asOf != null ? [`as of ${asOfMonth(rating.asOf)}`] : []),
  ].join(', ');
}

interface ChipProps {
  item: NormalizedMediaItem;
  episode?: UrlEpisode;
}

/** One score: mark, value, scale, (votes), then MAL's rank or Wikidata's month. Opens the title on its source. */
function RatingChip({ rating, item, episode }: ChipProps & { rating: NormalizedRating }) {
  const url = ratingUrl(rating, item, episode);
  return (
    <LinkPill
      external={url != null}
      icon={<ProviderIcon id={rating.source} size={16} />}
      label={spokenRating(rating)}
      onPress={() => (url != null ? openExternalUrl(url) : undefined)}
    >
      <Text className="text-foreground font-sans-semibold text-sm">
        {scoreText(rating)}
        {rating.scale !== '%' && <Text className="text-muted font-sans text-xs">{` /${rating.scale}`}</Text>}
      </Text>
      {rating.votes != null && (
        <Text className="text-muted font-sans text-xs">{`(${formatCount(rating.votes)})`}</Text>
      )}
      {rating.rank != null && <Text className="text-muted font-sans text-xs">{`#${rating.rank}`}</Text>}
      {rating.asOf != null && (
        <Text className="text-muted font-sans text-xs">{asOfMonth(rating.asOf)}</Text>
      )}
    </LinkPill>
  );
}

function ProviderLink({ provider, url }: { provider: ProviderId; url: string }) {
  return (
    <LinkPill
      external
      icon={<ProviderIcon id={provider} size={16} />}
      label={PROVIDERS[provider].label}
      onPress={() => openExternalUrl(url)}
    />
  );
}

/** The provider's own score chip, or its plain link when it has no score for the title. */
function ProviderScore({ provider, url, ratings, ...chip }: ChipProps & {
  provider: ProviderId;
  url: string;
  ratings: readonly NormalizedRating[] | undefined;
}) {
  const own = ratings?.find(({ source }) => source === provider);
  return own != null ? <RatingChip rating={own} {...chip} /> : <ProviderLink provider={provider} url={url} />;
}

function SimklScores(props: ChipProps & { url: string }) {
  const { data } = useSuspenseSimklRatingsQuery(props.item);
  return (
    <View className="flex-row gap-2">
      <ProviderScore provider="simkl" ratings={data} {...props} />
      {data.filter(({ source }) => source !== 'simkl').map((rating) => (
        <RatingChip key={rating.source} rating={rating} {...props} />
      ))}
    </View>
  );
}

function AniListScore(props: ChipProps & { url: string; mediaId: number }) {
  const { data } = useSuspenseAniListRelationsQuery({ mediaId: props.mediaId, type: props.item.type });
  return <ProviderScore provider="anilist" ratings={data.item?.ratings} {...props} />;
}

function LetterboxdFilmScore({ slug, ...props }: ChipProps & { url: string; slug: string }) {
  const { data } = useSuspenseLetterboxdFilmQuery(slug);
  return <ProviderScore provider="letterboxd" ratings={data?.ratings} {...props} />;
}

function LetterboxdScore(props: ChipProps & { url: string; tmdbId: number }) {
  const { data: slug } = useSuspenseLetterboxdSlugQuery(props.tmdbId);
  return slug == null ? <ProviderLink provider="letterboxd" url={props.url} /> : <LetterboxdFilmScore slug={slug} {...props} />;
}

/**
 * A connected provider's chip. Its link is known before its score, so the
 * plain link stands in while the score loads and if the read fails; the score
 * replaces it in place.
 */
function ProviderRating({ provider, url, item, resetKey }: {
  provider: ProviderId;
  url: string;
  item: NormalizedMediaItem;
  resetKey?: unknown;
}) {
  const link = <ProviderLink provider={provider} url={url} />;
  const { anilist, letterboxd, tmdb } = item.externalIds;
  let score;
  switch (provider) {
    case 'simkl':
      score = <SimklScores item={item} url={url} />;
      break;
    case 'anilist':
      score = anilist == null ? null : <AniListScore item={item} mediaId={anilist} url={url} />;
      break;
    case 'letterboxd':
      score = letterboxd != null
        ? <LetterboxdFilmScore item={item} slug={letterboxd} url={url} />
        : tmdb != null ? <LetterboxdScore item={item} tmdbId={tmdb} url={url} /> : null;
      break;
    case 'trakt':
    case 'serializd':
      score = null;
  }
  if (score == null) return link;
  return (
    <SuspenseSection errorFallback={link} fallback={link} resetKey={resetKey}>
      {score}
    </SuspenseSection>
  );
}

function WikidataScores({ item }: { item: NormalizedMediaItem }) {
  const { data } = useSuspenseWikidataRatingsQuery(item);
  if (data.length === 0) return null;
  return (
    <View className="flex-row gap-2">
      {data.map((rating) => <RatingChip item={item} key={rating.source} rating={rating} />)}
    </View>
  );
}

/**
 * The closing section of the details and episode screens: every source's score
 * for the title, on its own scale, then the connected providers that only link
 * (#318). It replaced the "View on" pills, so every chip opens the title on its
 * source.
 *
 * Arrival order is load order. TMDB's score comes with the item. A connected
 * provider shows its link at once and its score fills in. Rotten Tomatoes and
 * Metacritic come from Wikidata, have no link until it answers, and append to
 * the end, so they never push a chip that's already there.
 *
 * An episode carries its own TMDB score; the providers stay links, because
 * their scores are the show's.
 */
export function RatingsSection({
  item,
  episode,
  resetKey,
}: {
  item: NormalizedMediaItem;
  episode?: UrlEpisode & { ratings?: NormalizedRating[] };
  resetKey?: unknown;
}) {
  const connected = useConnectedProviders();
  const links = providerLinksFor(item, connected, episode);
  const scored = episode == null ? providersForRatings(item, connected) : [];
  const tmdb = (episode ?? item).ratings?.find(({ source }) => source === 'tmdb');
  const tmdbUrl = tmdbItemUrl(item, episode);
  // Every title Wikidata can look up also has a TMDB or source-provider link.
  if (tmdb == null && tmdbUrl == null && links.length === 0) return null;

  return (
    <Section>
      <Section.Header>
        <Section.Title>Ratings</Section.Title>
      </Section.Header>
      <LinkPill.Rail>
        {tmdb != null ? (
          <RatingChip episode={episode} item={item} rating={tmdb} />
        ) : (
          tmdbUrl != null && (
            <LinkPill
              external
              icon={<ProviderIcon id="tmdb" size={16} />}
              label="TMDB"
              onPress={() => openExternalUrl(tmdbUrl)}
            />
          )
        )}
        {links.map(({ provider, url }) =>
          scored.includes(provider) ? (
            <ProviderRating item={item} key={provider} provider={provider} resetKey={resetKey} url={url} />
          ) : (
            <ProviderLink key={provider} provider={provider} url={url} />
          ),
        )}
        {episode == null && item.type !== 'MANGA' && (
          <SuspenseSection fallback={null} resetKey={resetKey}>
            <WikidataScores item={item} />
          </SuspenseSection>
        )}
      </LinkPill.Rail>
    </Section>
  );
}
