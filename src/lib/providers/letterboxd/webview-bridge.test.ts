import { afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import type { LetterboxdWebRequest } from './deps';
import {
  getLetterboxdWebFetch,
  handleLetterboxdMessage,
  letterboxdWebFetch,
  letterboxdWatchlistWebFetch,
  letterboxdListLikeWebFetch,
  letterboxdListMembershipFetch,
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

test.each([
  { present: true, existing: false, action: { action: 'ADD', listable: 'filmLid' } },
  { present: false, existing: true, action: { action: 'DELETE', position: 1 } },
  { present: true, existing: true, action: null },
  { present: false, existing: false, action: null },
])('list membership sets $present from fresh entries, without replay', async ({ present, existing, action }) => {
  const webView = fakeWebView();
  registerLetterboxdWebView(webView.ref);
  const pending = letterboxdListMembershipFetch({ listPath: '/gian/list/classics/', username: 'gian', filmPath: '/film/alien/', present });
  expect(webView.pages[0].filmPath).toContain('/gian/list/classics/edit/');
  const dom = new Window({ url: 'https://letterboxd.com/gian/list/classics/edit/' });
  dom.document.body.innerHTML = '<div data-component-class="ListEditor" data-list-lid="listLid" data-list-version="4" data-list-url="/gian/list/classics/"></div>';
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    switch (url) {
      case '/film/alien/': return new Response('<meta name="production:identifier" content=\'{"type":"film","lid":"filmLid"}\'>');
      case '/s/load-list-entries': return new Response([{ listable: { lid: 'other' } }, ...(existing ? [{ listable: { lid: 'filmLid' } }] : []), { success: true }].map((entry) => JSON.stringify(entry)).join('\n'));
      case '/api/v0/list/listLid':
        if (init?.method === 'PATCH') return Response.json({ messages: [], data: { id: 'listLid', version: 5 } });
        return new Response('Forbidden', { status: 403 });
      default: throw new Error(`Unexpected URL ${url}`);
    }
  };
  const window = { location: dom.location, person: { loggedIn: true, username: 'gian' }, supermodelCSRF: 'csrf', ReactNativeWebView: { postMessage: handleLetterboxdMessage } };
  const storage = new Map();
  const sessionStorage = { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) };
  const run = new Function('window', 'document', 'sessionStorage', 'fetch', 'DOMParser', webView.pages[0].script);
  run(window, dom.document, sessionStorage, fetch, dom.DOMParser);
  expect(await pending).toEqual({ status: 200, body: JSON.stringify({ result: true, present, filmSlug: 'alien' }) });
  const writes = requests.filter((request) => request.init?.method === 'PATCH');
  expect(writes).toHaveLength(action == null ? 0 : 1);
  if (action != null) expect(JSON.parse(String(writes[0].init?.body))).toEqual({ version: 4, entries: [action] });
  const count = requests.length;
  run(window, dom.document, sessionStorage, fetch, dom.DOMParser);
  expect(requests).toHaveLength(count);
  dom.close();
});

test.each(['owner', 'account', 'path', 'version', 'incomplete', 'conflict', 'challenge', 'receipt'] as const)('list membership refuses %s failures', async (failure) => {
  const webView = fakeWebView();
  registerLetterboxdWebView(webView.ref);
  const pending = letterboxdListMembershipFetch({ listPath: '/gian/list/classics/', username: 'gian', filmPath: '/film/alien/', present: false });
  const dom = new Window({ url: `https://letterboxd.com/gian/list/${failure === 'path' ? 'other' : 'classics'}/edit/` });
  dom.document.body.innerHTML = `<div data-component-class="ListEditor" data-list-lid="listLid" data-list-version="${failure === 'version' ? '' : '4'}" data-list-url="/${failure === 'owner' ? 'other' : 'gian'}/list/classics/"></div>`;
  let writes = 0;
  const fetch = async (url: string, init?: RequestInit) => {
    if (url === '/film/alien/') return new Response('<meta name="production:identifier" content=\'{"type":"film","lid":"filmLid"}\'>');
    if (url === '/s/load-list-entries') return new Response('{"listable":{"lid":"filmLid"}}\n' + (failure === 'incomplete' ? '' : '{"success":true}'));
    if (init?.method === 'PATCH') { writes += 1; return failure === 'conflict' ? new Response('{}', { status: 409 }) : failure === 'challenge' ? new Response('Verify', { status: 403, headers: { 'cf-mitigated': 'challenge' } }) : Response.json({ messages: [], data: { id: 'wrong-list', version: 5 } }); }
    return new Response('Forbidden', { status: 403 });
  };
  const run = new Function('window', 'document', 'sessionStorage', 'fetch', 'DOMParser', webView.pages[0].script);
  run({ location: dom.location, person: { loggedIn: true, username: failure === 'account' ? 'other' : 'gian' }, supermodelCSRF: 'csrf', ReactNativeWebView: { postMessage: handleLetterboxdMessage } }, dom.document, { getItem() {}, setItem() {} }, fetch, dom.DOMParser);
  const result = await pending;
  expect(result.status).toBe(0);
  if (failure === 'challenge') expect(result.body).toContain('verification');
  expect(writes).toBe(['conflict', 'challenge', 'receipt'].includes(failure) ? 1 : 0);
  dom.close();
});
