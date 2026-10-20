import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { Suspense, type ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { CenteredNotice } from '@/components/centered-notice';
import Head from '@/components/head';
import { usePushRoute } from '@/lib/navigation';
import { PROVIDERS } from '@/lib/providers/registry';
import { routes } from '@/lib/routes';
import { ListsHeader, ProviderListLink } from './list-header';

/** Request failures and render failures share the same retry and provider escape hatch. */
export function ListsLoadError({ provider, url, index = false, title = 'List', shareHref, onRetry }: {
  provider: 'letterboxd' | 'serializd';
  url: string;
  index?: boolean;
  title?: string;
  shareHref?: string;
  onRetry: () => unknown;
}) {
  return <>
    {!index && <ListsHeader provider={provider} shareHref={shareHref} title={title} />}
    <CenteredNotice>
      <CenteredNotice.Icon name="list-outline" />
      <CenteredNotice.Title>Couldn’t load {index ? 'your lists' : 'this list'}</CenteredNotice.Title>
      <CenteredNotice.Body>{provider === 'letterboxd' ? 'Letterboxd may be blocking this page. Try again later or open it on Letterboxd. Private or deleted lists aren’t available here.' : 'The list may be private, unavailable, or your Serializd session may need reconnecting.'}</CenteredNotice.Body>
      <View className="mt-6 items-center gap-3">
        <Button icon={<Button.Icon name="refresh" />} label="Try again" onPress={() => void onRetry()} />
        {!index && <ProviderListLink provider={provider} url={url} />}
      </View>
    </CenteredNotice>
  </>;
}

/** Shared recovery and loading frame; resource pages own their query and identity. */
export function ListsPage({ provider, title = 'List', url, shareHref, index = false, embedded = false, unavailable = 'invalid', children, fallback, contentKey }: {
  provider: 'letterboxd' | 'serializd';
  title?: string;
  url: string | null;
  /** Keeps a detail page's Share in its header when the list fails to load. */
  shareHref?: string;
  index?: boolean;
  /** A pager owns the shared header and document title; this page owns recovery. */
  embedded?: boolean;
  unavailable?: 'invalid' | 'connect';
  children?: ReactNode;
  fallback?: ReactNode;
  /**
   * Remounts the content (boundary + suspense) when its resource owner changes,
   * without remounting the shared header.
   */
  contentKey?: string;
}) {
  const { reset } = useQueryErrorResetBoundary();
  const pushRoute = usePushRoute();
  const label = PROVIDERS[provider].label;
  return (
    <View className="flex-1 bg-background">
      {!embedded && <Head><title>{`${title} — Shinobu`}</title></Head>}
      {index && !embedded && <ListsHeader morphTitle provider={provider} title={title} />}
      {url == null ? (
        <>
          {!index && <ListsHeader provider={provider} title={title} />}
          <CenteredNotice>
            <CenteredNotice.Icon name="list-outline" />
            <CenteredNotice.Title>{unavailable === 'connect' ? `Connect ${label}` : 'Invalid list link'}</CenteredNotice.Title>
            <CenteredNotice.Body>{unavailable === 'connect' ? `Connect ${label} to browse your created and liked lists.` : `This link doesn’t identify a ${label} list page.`}</CenteredNotice.Body>
            <CenteredNotice.Action icon={<Button.Icon name={unavailable === 'connect' ? 'link-outline' : 'home-outline'} />} label={unavailable === 'connect' ? `Connect ${label}` : 'Go home'} onPress={() => pushRoute(unavailable === 'connect' ? routes.settings : routes.home)} />
          </CenteredNotice>
        </>
      ) : (
        <ErrorBoundary key={contentKey ?? url} onReset={reset} fallbackRender={({ resetErrorBoundary }) => (
          <ListsLoadError index={index} onRetry={resetErrorBoundary} provider={provider} shareHref={shareHref} title={title} url={url} />
        )}>
          <Suspense fallback={fallback}>{children}</Suspense>
        </ErrorBoundary>
      )}
    </View>
  );
}
