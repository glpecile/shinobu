import { afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import type { LetterboxdWebRequest } from './deps';
import {
  getLetterboxdWebFetch,
  handleLetterboxdMessage,
  letterboxdWebFetch,
  letterboxdWatchlistWebFetch,
  registerLetterboxdWebView,
  resetLetterboxdWebViewBridge,
} from './webview-bridge';

function fakeWebView() {
  const pages: Array<{ filmPath: string; script: string }> = [];
  return {
    pages,
    ref: {
      loadFilmPage: (filmPath: string, script: string) => {
        pages.push({ filmPath, script });
      },
    },
  };
}

const REQUEST: LetterboxdWebRequest = {
  filmPath: '/film/tuner/',
  filmLid: 'UH8e',
  viewingDateStr: '2026-07-17',
  tags: ['rewatch-night', 'imax'],
  rewatch: false,
  liked: true,
};

afterEach(() => resetLetterboxdWebViewBridge());

describe('Letterboxd page-load write bridge', () => {
  test('rejects when no WebView is mounted', async () => {
    await expect(letterboxdWebFetch(REQUEST)).rejects.toThrow(/not mounted/);
  });

  test.each(['diary', 'watchlist'] as const)('%s writes from the loaded page once, even on reload', async (verb) => {
    const webView = fakeWebView();
    registerLetterboxdWebView(webView.ref);
    const pending = verb === 'diary'
      ? letterboxdWebFetch(REQUEST)
      : letterboxdWatchlistWebFetch({ filmPath: REQUEST.filmPath, filmLid: REQUEST.filmLid, inWatchlist: false });
    const page = webView.pages[0];
    expect(page.filmPath).toBe(REQUEST.filmPath);

    const dom = new Window({ url: `https://letterboxd.com${page.filmPath}` });
    dom.document.head.innerHTML = '<meta name="production:identifier" content=\'{"lid":"pageLid"}\'>';
    const storage = new Map<string, string>();
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const window = {
      location: dom.location,
      supermodelCSRF: 'page-csrf',
      ReactNativeWebView: { postMessage: handleLetterboxdMessage },
    };
    const fetch = async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      if (url === '/ajax/letterboxd-metadata/') return Response.json({ csrf: 'page-csrf' });
      return new Response('{"logEntry":{"id":"saved"}}', { status: 200 });
    };
    const run = new Function('window', 'document', 'sessionStorage', 'fetch', page.script);
    const sessionStorage = { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) };
    run(window, dom.document, sessionStorage, fetch);
    expect(await pending).toEqual({ status: 200, body: '{"logEntry":{"id":"saved"}}' });
    // A different document models a reload, not just another call in one page.
    const reloaded = new Window({ url: dom.location.href });
    reloaded.document.head.innerHTML = dom.document.head.innerHTML;
    run(window, reloaded.document, sessionStorage, fetch);
    expect(requests).toHaveLength(verb === 'diary' ? 1 : 2);
    const write = requests[requests.length - 1];
    expect(write.url).toBe(verb === 'diary' ? '/api/v0/production-log-entries' : '/api/v0/me/watchlist/pageLid');
    expect(write.init).toMatchObject({
      method: verb === 'diary' ? 'POST' : 'PATCH',
      credentials: 'include',
    });
    expect(new Headers(write.init.headers).get('x-csrf-token')).toBe('page-csrf');
    expect(JSON.parse(String(write.init.body))).toEqual(verb === 'diary' ? {
      productionId: 'pageLid', diaryDetails: { diaryDate: '2026-07-17', rewatch: false }, tags: REQUEST.tags, like: true,
    } : { inWatchlist: false });
    dom.close();
    reloaded.close();
  });

  test('ignores messages that are not ours', async () => {
    const webView = fakeWebView();
    registerLetterboxdWebView(webView.ref);
    const pending = letterboxdWebFetch(REQUEST);
    const id = /var id = "([^"]+)"/.exec(webView.pages[0].script)![1];
    handleLetterboxdMessage('not json');
    handleLetterboxdMessage(JSON.stringify({ id: 'someone-else', status: 200, body: '{}' }));
    handleLetterboxdMessage(JSON.stringify({ id, status: 200, body: '{}' }));
    expect((await pending).status).toBe(200);
  });

  test('rejects in-flight writes when the bridge unmounts', async () => {
    const webView = fakeWebView();
    registerLetterboxdWebView(webView.ref);
    const pending = letterboxdWebFetch(REQUEST);
    registerLetterboxdWebView(null);
    await expect(pending).rejects.toThrow(/unmounted/);
  });
});

test('the transport is unavailable until the bridge mounts', () => {
  expect(getLetterboxdWebFetch()).toBeUndefined();
  registerLetterboxdWebView(fakeWebView().ref);
  expect(getLetterboxdWebFetch()).toBe(letterboxdWebFetch);
});
