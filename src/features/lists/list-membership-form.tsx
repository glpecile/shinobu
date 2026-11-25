import { Suspense, useDeferredValue, useState } from 'react';
import { Keyboard, Text, View } from 'react-native';
import { QueryErrorResetBoundary, useIsFetching } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';

import { Button } from '@/components/button';
import { CenteredNotice } from '@/components/centered-notice';
import { Fab } from '@/components/fab';
import { List } from '@/components/List';
import { PresstableOpacity } from '@/components/presstable';
import { Sheet } from '@/components/sheet';
import { SearchField } from '@/components/search-field';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { SmallPoster } from '@/components/small-poster';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { installLetterboxdScript, letterboxdScriptHint } from '@/lib/install-letterboxd-script';
import { openExternalUrl } from '@/lib/open-external-url';
import { providerItemUrl } from '@/lib/providers/external-urls';
import { PROVIDERS } from '@/lib/providers/registry';
import { useLetterboxdUserscript, useLetterboxdUserscriptUntrusted } from '@/lib/providers/letterboxd/userscript-bridge';
import { Provider } from '@/lib/providers/types';
import { toast } from '@/lib/toast';
import { hardcoverQueryKeys, useSuspenseHardcoverBookSearchQuery } from '@/state/queries/hardcover';
import { useListMembership, useSuspenseListSearchQuery, type ListEditTarget } from '@/state/queries/list-membership';
import { useHasLetterboxdWriteSession } from '@/state/session/letterboxd';
import { getClientIdForProvider } from '@/state/session/provider-config';
import { tmdbQueryKeys } from '@/state/queries/tmdb';
import { traktQueryKeys } from '@/state/queries/trakt';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedMediaItem } from '@/types/media';

type ListSearchTarget = Pick<ListEditTarget, 'provider' | 'title' | 'url'>;

function ListRecovery({ target, item }: { target: ListSearchTarget; item?: NormalizedMediaItem }) {
  const itemUrl = target.provider === Provider.Hardcover && item != null ? providerItemUrl(target.provider, item) : null;
  return <Button icon={<Button.Icon name="open-outline" />} label={`Open on ${PROVIDERS[target.provider].label}`} onPress={() => void openExternalUrl(itemUrl ?? target.url)} variant="quiet" />;
}

function copy(provider: ListSearchTarget['provider']) {
  switch (provider) {
    case Provider.Letterboxd:
      return { noun: 'films', add: 'Add a film', find: 'Find a film', fab: 'Add a film to this list', kept: 'Your watched history will stay the same.' };
    case Provider.Serializd:
      return { noun: 'shows', add: 'Add a show', find: 'Find a show', fab: 'Add a show to this list', kept: 'Your watched history will stay the same.' };
    case Provider.Hardcover:
      return { noun: 'books', add: 'Add a book', find: 'Find a book', fab: 'Add a book to this list', kept: 'Your reading history will stay the same.' };
  }
}

export function ListMembershipForm({ target, item, present, entryId, subtitle, onBack, onDone }: {
  target: ListEditTarget;
  item: NormalizedMediaItem;
  present: boolean;
  entryId?: string;
  subtitle?: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const mutation = useListMembership(target);
  const hasSession = useHasLetterboxdWriteSession();
  const hasScript = useLetterboxdUserscript('list-membership');
  const scriptUntrusted = useLetterboxdUserscriptUntrusted();
  const needsScript = process.env.EXPO_OS === 'web' && target.provider === Provider.Letterboxd && !hasScript;
  const writable = target.provider !== Provider.Letterboxd || (process.env.EXPO_OS === 'web' ? hasScript : hasSession);
  const verb = present ? 'Add to list' : 'Remove from list';
  return (
    <WriteSheet.Step>
      <WriteSheet.Header onClose={onBack}><WriteSheet.Title>{verb}</WriteSheet.Title></WriteSheet.Header>
      <View className="flex-row items-center gap-4 mt-5">
        <SmallPoster recyclingKey={item.id} size="lg" uri={item.coverImage} />
        <View className="flex-1 min-w-0 gap-1">
          <Text className="text-foreground font-sans-semibold text-base">{item.title}</Text>
          <Text className="text-muted font-sans text-sm">{subtitle ?? item.year}</Text>
        </View>
      </View>
      <WriteSheet.Description>{present ? `Add to "${target.title}"?` : `Remove from "${target.title}"? ${copy(target.provider).kept}`}</WriteSheet.Description>
      {!writable && <WriteSheet.Description>{needsScript ? letterboxdScriptHint(scriptUntrusted, 'edit this list here') : 'Reconnect Letterboxd with a signed-in session to edit lists here.'}</WriteSheet.Description>}
      {mutation.isError && <WriteSheet.Error>{mutation.error.message}</WriteSheet.Error>}
      <WriteSheet.Actions>
        {needsScript && !scriptUntrusted && <Button icon={<Button.Icon name="open-outline" />} label="Install Letterboxd script" onPress={installLetterboxdScript} />}
        {writable && <Button
          icon={<Button.Icon name={present ? 'add' : 'trash-outline'} />}
          label={mutation.isError ? 'Try again' : verb}
          loading={mutation.isPending}
          loadingLabel={present ? 'Adding…' : 'Removing…'}
          onPress={() => {
            if (present) haptics.confirm();
            else haptics.destructive();
            mutation.mutate({ item, present, entryId }, {
              onSuccess: () => { toast.success(present ? 'Added to list' : 'Removed from list', item.title); onDone(); },
              onError: () => haptics.error(),
            });
          }}
        />}
        <Button disabled={mutation.isPending} icon={<Button.Icon name="arrow-back" />} label={present ? 'Back' : 'Cancel'} onPress={onBack} variant="ghost" />
        {(!writable || mutation.isError) && <ListRecovery item={item} target={target} />}
      </WriteSheet.Actions>
    </WriteSheet.Step>
  );
}

type ResultsProps = { query: string; items: readonly NormalizedMediaItem[]; onSelect: (item: NormalizedMediaItem) => void };

function SearchResults({ source, type, ...props }: ResultsProps & { source: 'tmdb' | typeof Provider.Trakt; type: 'MOVIE' | 'TV' }) {
  const { data } = useSuspenseListSearchQuery(props.query, source);
  return <ResultRows {...props} results={data.filter((item) => item.type === type)} />;
}

function BookSearchResults(props: ResultsProps) {
  const { data } = useSuspenseHardcoverBookSearchQuery(props.query);
  return <ResultRows {...props} results={data} />;
}

function ResultRows({ query, results, items, onSelect }: ResultsProps & { results: readonly NormalizedMediaItem[] }) {
  return <List
    data={results}
    estimatedItemSize={76}
    extraData={items}
    keyExtractor={(item) => item.id}
    keyboardShouldPersistTaps="handled"
    scrollEnabled={false}
    renderItem={({ item }) => {
      const listed = items.some((entry) => entry.id === item.id || (entry.externalIds.tmdb != null && entry.externalIds.tmdb === item.externalIds.tmdb) || (entry.externalIds.hardcover != null && entry.externalIds.hardcover === item.externalIds.hardcover));
      return <PresstableOpacity
        accessibilityLabel={`${item.title}${item.year == null ? '' : `, ${item.year}`}${listed ? ', already in list' : ''}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: listed }}
        className={cn('flex-row items-center gap-3 py-2', listed && 'opacity-50')}
        disabled={listed}
        onPress={() => { Keyboard.dismiss(); haptics.selection(); onSelect(item); }}
      >
        <SmallPoster recyclingKey={item.id} size="sm" uri={item.coverImage} />
        <View className="flex-1 min-w-0">
          <Text className="text-foreground font-sans-semibold text-sm" numberOfLines={2}>{item.title}</Text>
          <Text className="text-muted font-sans text-xs mt-1">{listed ? 'Already in list' : item.year}</Text>
        </View>
      </PresstableOpacity>;
    }}
    ListEmptyComponent={
      <CenteredNotice className="min-h-80">
        <CenteredNotice.Icon name="search-outline" />
        <CenteredNotice.Title>No results</CenteredNotice.Title>
        <CenteredNotice.Body>{`Nothing matched "${query}". Try another title.`}</CenteredNotice.Body>
      </CenteredNotice>
    }
  />;
}

export function ListSearch({ target, items, onSelect, onClose }: {
  target: ListSearchTarget;
  items: readonly NormalizedMediaItem[];
  onSelect: (item: NormalizedMediaItem) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const query = useDeferredValue(text.trim());
  const token = useTmdbToken();
  const source = token != null && token !== '' ? 'tmdb' : getClientIdForProvider(Provider.Trakt) ? Provider.Trakt : null;
  const books = target.provider === Provider.Hardcover;
  const fetching = useIsFetching({ queryKey: books ? hardcoverQueryKeys.search(query) : source === Provider.Trakt ? traktQueryKeys.search(query, 20) : tmdbQueryKeys.search(query), exact: true }) > 0;
  const { noun, add, find } = copy(target.provider);
  return <WriteSheet.Step>
    <WriteSheet.Header onClose={onClose}><WriteSheet.Title>{add}</WriteSheet.Title></WriteSheet.Header>
    <WriteSheet.Description>{target.title}</WriteSheet.Description>
    <View className="mt-4">
      <SearchField
        accessibilityLabel={`Search ${noun}`}
        loading={(books || source != null) && text.trim().length >= 2 && (fetching || query !== text.trim())}
        onChangeText={setText}
        placeholder={`Search ${noun}`}
        value={text}
      />
    </View>
    <View className="min-h-80">
      {!books && source == null ? (
        <CenteredNotice className="min-h-80">
          <CenteredNotice.Icon name="search-outline" />
          <CenteredNotice.Title>Search unavailable</CenteredNotice.Title>
          <CenteredNotice.Body>Connect TMDB or add Trakt credentials to search here.</CenteredNotice.Body>
          <View className="mt-6"><ListRecovery target={target} /></View>
        </CenteredNotice>
      ) : text.trim().length < 2 || query.length < 2 ? (
        <CenteredNotice className="min-h-80">
          <CenteredNotice.Glyph>忍</CenteredNotice.Glyph>
          <CenteredNotice.Title>{find}</CenteredNotice.Title>
          <CenteredNotice.Body>{`Search ${noun} to add to this list. Enter at least two characters to begin.`}</CenteredNotice.Body>
        </CenteredNotice>
      ) : (
        <QueryErrorResetBoundary>
          {({ reset }) => <ErrorBoundary
            onReset={reset}
            resetKeys={[query]}
            fallbackRender={({ resetErrorBoundary }) => (
              <CenteredNotice className="min-h-80">
                <CenteredNotice.Icon name="cloud-offline-outline" />
                <CenteredNotice.Title>Search failed</CenteredNotice.Title>
                <CenteredNotice.Body>Check your connection and try again.</CenteredNotice.Body>
                <CenteredNotice.Action icon={<Button.Icon name="refresh" />} label="Retry search" onPress={resetErrorBoundary} />
                <View className="mt-2"><ListRecovery target={target} /></View>
              </CenteredNotice>
            )}
          >
            <Suspense fallback={
              <View className="gap-4 mt-4" accessibilityLabel="Loading search results">
                {[0, 1, 2].map((index) => (
                  <View className="flex-row items-center gap-3" key={index}>
                    <Skeleton className="w-9 h-13.5 rounded" delay={staggerDelay(index)} />
                    <View className="flex-1 gap-2">
                      <Skeleton className="h-4 w-3/4 rounded" delay={staggerDelay(index)} />
                      <Skeleton className="h-3 w-12 rounded" delay={staggerDelay(index)} />
                    </View>
                  </View>
                ))}
              </View>
            }>
              {books
                ? <BookSearchResults items={items} onSelect={onSelect} query={query} />
                : source != null && <SearchResults items={items} onSelect={onSelect} query={query} source={source} type={target.provider === Provider.Letterboxd ? 'MOVIE' : 'TV'} />}
            </Suspense>
          </ErrorBoundary>}
        </QueryErrorResetBoundary>
      )}
    </View>
  </WriteSheet.Step>;
}

export function AddToList({ target, items }: { target: ListEditTarget; items: readonly NormalizedMediaItem[] }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [selected, setSelected] = useState<NormalizedMediaItem | null>(null);
  return <>
    <Fab className="absolute bottom-6 end-6" icon="add" label={copy(target.provider).fab} onPress={() => { setSelected(null); setSession(session + 1); setOpen(true); }} />
    <Sheet onClose={() => setOpen(false)} open={open}>
      {session > 0 && (selected == null
        ? <ListSearch items={items} key={`search-${session}`} onClose={() => setOpen(false)} onSelect={setSelected} target={target} />
        : <ListMembershipForm item={selected} key="confirm" onBack={() => setSelected(null)} onDone={() => setOpen(false)} present target={target} />)}
    </Sheet>
  </>;
}
