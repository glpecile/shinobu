import { afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import type { LetterboxdWebRequest } from './deps';
import {
  getLetterboxdWebFetch,
  handleLetterboxdMessage,
  letterboxdWebFetch,
  letterboxdWatchlistWebFetch,
  letterboxdListLikeWebFetch,
  registerLetterboxdWebView,
  resetLetterboxdWebViewBridge,
} from './webview-bridge';

function fakeWebView() {
  const pages: Array<{ filmPath: string; script: string }> = [];
  return {
    pages,
    ref: {
      loadPage: (filmPath: string, script: string) => {
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

  test.each(['diary', 'watchlist', 'list-like', 'list-unlike'] as const)('%s writes from the loaded page once, even on reload', async (verb) => {
    const webView = fakeWebView();
    registerLetterboxdWebView(webView.ref);
    const isList = verb === 'list-like' || verb === 'list-unlike';
    const pending = isList
      ? letterboxdListLikeWebFetch({ listPath: '/jack/list/classics/', username: 'gian', liked: verb === 'list-like' })
      : verb === 'diary'
      ? letterboxdWebFetch(REQUEST)
      : letterboxdWatchlistWebFetch({ filmPath: REQUEST.filmPath, filmLid: REQUEST.filmLid, inWatchlist: false });
    const page = webView.pages[0];
    expect(page.filmPath).toBe(isList ? '/jack/list/classics/' : REQUEST.filmPath);

    const dom = new Window({ url: `https://letterboxd.com${page.filmPath}` });
    dom.document.head.innerHTML = '<meta name="production:identifier" content=\'{"lid":"pageLid"}\'>';
    dom.document.body.innerHTML = '<section id="userpanel" data-owner="jack" data-list-identifier=\'{"type":"list","uid":"filmlist:79356687"}\'></section>';
    const storage = new Map<string, string>();
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const window = {
      location: dom.location,
      supermodelCSRF: 'page-csrf',
      person: { loggedIn: true, username: 'gian', trusted: true },
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
    reloaded.document.body.innerHTML = dom.document.body.innerHTML;
    run(window, reloaded.document, sessionStorage, fetch);
    expect(requests).toHaveLength(verb === 'watchlist' ? 2 : 1);
    const write = requests[requests.length - 1];
    expect(write.url).toBe(isList ? '/s/filmlist:79356687/like/' : verb === 'diary' ? '/api/v0/production-log-entries' : '/api/v0/me/watchlist/pageLid');
    expect(write.init).toMatchObject({
      method: verb === 'watchlist' ? 'PATCH' : 'POST',
      credentials: 'include',
    });
    if (isList) expect(Object.fromEntries(new URLSearchParams(String(write.init.body)))).toEqual({ liked: String(verb === 'list-like'), __csrf: 'page-csrf' });
    else {
      expect(new Headers(write.init.headers).get('x-csrf-token')).toBe('page-csrf');
      expect(JSON.parse(String(write.init.body))).toEqual(verb === 'diary' ? {
      productionId: 'pageLid', diaryDetails: { diaryDate: '2026-07-17', rewatch: false }, tags: REQUEST.tags, like: true,
    } : { inWatchlist: false });
    }
    dom.close();
    reloaded.close();
  });

  test.each(['account', 'path', 'identifier', 'captcha', 'csrf', 'own-list'] as const)('list likes refuse %s failures without writing', async (failure) => {
    const webView = fakeWebView();
    registerLetterboxdWebView(webView.ref);
    const pending = letterboxdListLikeWebFetch({ listPath: '/jack/list/classics/', username: 'gian', liked: true });
    const dom = new Window({ url: `https://letterboxd.com/${failure === 'path' ? 'jack/list/other' : 'jack/list/classics'}/` });
    dom.document.body.innerHTML = `<section id="userpanel" data-owner="${failure === 'own-list' ? 'gian' : 'jack'}" data-list-identifier='{"type":"list","uid":"${failure === 'identifier' ? 'film:123' : 'filmlist:123'}"}'></section>`;
    const window = { location: dom.location, supermodelCSRF: failure === 'csrf' ? '' : 'csrf', person: { loggedIn: true, username: failure === 'account' ? 'other' : 'gian', trusted: failure !== 'captcha' }, ReactNativeWebView: { postMessage: handleLetterboxdMessage } };
    const run = new Function('window', 'document', 'sessionStorage', 'fetch', webView.pages[0].script);
    let writes = 0;
    run(window, dom.document, { getItem() {}, setItem() {} }, async () => { writes += 1; return Response.json({ result: true, liked: true }); });
    expect((await pending).status).toBe(0);
    expect(writes).toBe(0);
    dom.close();
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
