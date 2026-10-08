import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { getLetterboxdUserscriptFetch, hasLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge/index.web';

const script = await Bun.file(new URL('../public/letterboxd.user.js', import.meta.url)).text();
const run = new Function('GM', 'unsafeWindow', `return ${script.slice(script.indexOf('(async ()'))}`);
const id = '12345678-1234-1234-1234-123456789abc';

test('keeps unsupported old-script writes blocked and detects installed-script capabilities', async () => {
  const app = new Window({ url: 'http://localhost:8081/' });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: app.document });
  try {
    app.document.documentElement.setAttribute('data-shinobu-letterboxd-bridge', '3');
    expect(hasLetterboxdUserscript('log')).toBe(true);
    expect(hasLetterboxdUserscript('watchlist')).toBe(false);
    app.document.documentElement.setAttribute('data-shinobu-letterboxd-bridge', '4');
    expect(hasLetterboxdUserscript('watchlist')).toBe(true);
    expect(hasLetterboxdUserscript('watchlist-remove')).toBe(false);
    app.document.documentElement.setAttribute('data-shinobu-letterboxd-bridge', '5');
    expect(hasLetterboxdUserscript('log')).toBe(true);
    expect(hasLetterboxdUserscript('like')).toBe(false);
    expect(hasLetterboxdUserscript('list-like')).toBe(false);
    await expect(getLetterboxdUserscriptFetch('gian')!({
      filmPath: '/film/alien/', filmLid: '2awY', viewingDateStr: '2026-09-30',
      rewatch: false, tags: [], liked: true,
    })).rejects.toThrow('Update the Letterboxd script');
    await run({}, { location: app.location, document: app.document, addEventListener() {} });
    expect(hasLetterboxdUserscript('watchlist-remove')).toBe(true);
    expect(hasLetterboxdUserscript('like')).toBe(true);
    expect(hasLetterboxdUserscript('list-like')).toBe(true);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
    app.close();
  }
});

test.each([
  { name: 'hands a liked Shinobu log to the Letterboxd tab and returns its receipt', username: 'gian', path: '/film/alien/', status: 200, body: '{"logEntry":{"id":"abc"}}', sent: true, message: 'abc', liked: true },
  { name: 'refuses a non-boolean like before opening a tab', username: 'gian', path: '/film/alien/', status: 200, body: '{}', sent: false, message: 'Invalid Shinobu write request', liked: 'yes' },
  { name: 'resolves a TMDB redirect in the browser', username: 'gian', path: '/tmdb/348/', status: 200, body: '{"logEntry":{"id":"abc"}}', sent: true, message: 'abc' },
  { name: 'refuses to log to a different account', username: 'other', path: '/film/alien/', status: 200, body: '{}', sent: false, message: 'signed in as other' },
  { name: 'refuses a different film', username: 'gian', path: '/film/wrong-film/', status: 200, body: '{}', sent: false, message: 'different film' },
  { name: 'returns a challenge as a failure without retrying', username: 'gian', path: '/film/alien/', status: 403, body: '<title>Just a moment...</title>', sent: true, message: 'Cloudflare challenge' },
  { name: 'does not treat validation errors as success', username: 'gian', path: '/film/alien/', status: 200, body: '{"messages":[{"type":"Error","text":"Invalid film"}]}', sent: true, message: 'Invalid film' },
  { name: 'does not treat an empty response as a receipt', username: 'gian', path: '/film/alien/', status: 200, body: '{}', sent: true, message: 'No log receipt' },
  { name: 'adds to the watchlist and returns the empty 204 receipt', username: 'gian', path: '/film/alien/', status: 204, body: '', sent: true, message: '', watchlist: true },
  { name: 'acknowledges a watchlist removal with an empty 200 response and closes the tab', username: 'gian', path: '/film/alien/', status: 200, body: '', sent: true, message: '', watchlist: false },
  { name: 'acknowledges a successful JSON watchlist response', username: 'gian', path: '/film/alien/', status: 200, body: '{}', sent: true, message: '', watchlist: true },
  { name: 'rejects watchlist API validation errors', username: 'gian', path: '/film/alien/', status: 200, body: '{"messages":[{"type":"Error","text":"Invalid film"}]}', sent: true, message: 'Invalid film', watchlist: false },
  { name: 'rejects a watchlist failure marker', username: 'gian', path: '/film/alien/', status: 200, body: '{"result":false}', sent: true, message: 'Watchlist rejected', watchlist: false },
  { name: 'does not acknowledge an HTML watchlist response', username: 'gian', path: '/film/alien/', status: 200, body: '<html>Sign in</html>', sent: true, message: 'Non-JSON response', watchlist: false },
  { name: 'removes from the watchlist and returns the empty 204 receipt', username: 'gian', path: '/film/alien/', status: 204, body: '', sent: true, message: '', watchlist: false },
  { name: 'likes a list through the signed-in tab and confirms its receipt', username: 'gian', path: '/jack/list/classics/', status: 200, body: '{"result":true,"liked":true}', sent: true, message: '', listLike: true },
  { name: 'unlikes a list without captcha for an untrusted member', username: 'gian', path: '/jack/list/classics/', status: 200, body: '{"result":true,"liked":false}', sent: true, message: '', listLike: false, trusted: false },
  { name: 'leaves captcha-required likes on Letterboxd', username: 'gian', path: '/jack/list/classics/', status: 200, body: '{}', sent: false, message: 'complete its verification', listLike: true, trusted: false },
  { name: 'rejects a different list before writing', username: 'gian', path: '/jack/list/wrong-list/', status: 200, body: '{}', sent: false, message: 'different list', listLike: true },
  { name: 'rejects a list traversal before opening a tab', username: 'gian', path: '/jack/list/../settings/', status: 200, body: '{}', sent: false, message: 'Invalid Shinobu', listLike: true },
  { name: 'does not acknowledge a rejected list like', username: 'gian', path: '/jack/list/classics/', status: 200, body: '{"result":false,"liked":true}', sent: true, message: 'No confirmed like receipt', listLike: true },
])('$name', async ({ username, path, status, body, sent, message, ...options }) => {
  const watchlist = 'watchlist' in options;
  const listLike = 'listLike' in options;
  const app = new Window({ url: 'http://localhost:8081/' });
  const film = new Window({ url: `https://letterboxd.com${listLike ? '/jack/list/classics/' : '/film/alien/'}#shinobu-log=${id}` });
  film.document.body.innerHTML = `<meta name="production:identifier" content='{"lid":"2awY","type":"film"}'><section id="userpanel" data-owner="jack" data-list-identifier='{"type":"list","uid":"filmlist:79356687"}'></section>`;
  film.document.body.dataset.tmdbType = 'movie';
  film.document.body.dataset.tmdbId = '348';
  const storage = new Map<string, unknown>();
  let storageListener: ((key: string, old: unknown, value: unknown) => void) | undefined;
  let appListener: (event: unknown) => Promise<void>;
  let receive!: (response: { status: number; body: string }) => void;
  const result = new Promise<{ status: number; body: string }>(resolve => { receive = resolve; });
  const requests: RequestInit[] = [];
  let closed = false;
  const appPage = {
    location: app.location, document: app.document,
    addEventListener: (_name: string, callback: typeof appListener) => { appListener = callback; },
    postMessage: (data: { response: { status: number; body: string } }) => receive(data.response),
  };
  const filmPage = {
    location: film.location, document: film.document,
    person: { loggedIn: true, username, trusted: !('trusted' in options) || options.trusted }, supermodelCSRF: 'test-csrf',
    fetch: async (url: string, init: RequestInit) => {
      expect(url).toBe(listLike ? '/s/filmlist:79356687/like/' : watchlist ? '/api/v0/me/watchlist/2awY' : '/api/v0/production-log-entries');
      requests.push(init);
      return new Response(status === 204 ? null : body, { status });
    },
  };
  const gm = {
    getValue: async (key: string) => storage.get(key),
    setValue: async (key: string, value: unknown) => {
      storage.set(key, value);
      if (key.includes('response-')) storageListener?.(key, undefined, value);
    },
    deleteValue: async (key: string) => { storage.delete(key); },
    addValueChangeListener: async (_key: string, callback: typeof storageListener) => { storageListener = callback; return 1; },
    removeValueChangeListener: async () => { storageListener = undefined; },
    openInTab: async (url: string) => {
      expect(url).toBe(`https://letterboxd.com${path}#shinobu-log=${id}`);
      await run(gm, filmPage);
      return { close() { closed = true; } };
    },
  };
  await run(gm, appPage);
  const event = { source: appPage, origin: app.location.origin, data: {
    type: listLike ? 'shinobu-letterboxd-list-like' : watchlist ? 'shinobu-letterboxd-watchlist' : 'shinobu-letterboxd-log', id,
    request: { username: 'gian', ...(listLike ? { listPath: path, liked: options.listLike } : { filmPath: path, ...(watchlist ? { inWatchlist: options.watchlist } : { viewingDateStr: '2026-09-30', rewatch: false, tags: ['spike'], ...('liked' in options ? { liked: options.liked } : {}) }) }) },
  } };
  await appListener!(event);
  const response = await result;
  expect(closed).toBe(message === 'abc' || message === '');
  expect(response.status).toBe(message === 'abc' || message === '' ? status : 0);
  expect(response.body).toContain(message);
  expect(requests).toHaveLength(sent ? 1 : 0);
  if (sent) {
    expect(requests[0].credentials).toBe('include');
    expect(requests[0].method).toBe(watchlist ? 'PATCH' : 'POST');
    if (listLike) expect(Object.fromEntries(new URLSearchParams(String(requests[0].body)))).toEqual({ liked: String(options.listLike), __csrf: 'test-csrf' });
    else expect(JSON.parse(String(requests[0].body))).toEqual(watchlist ? { inWatchlist: options.watchlist } : {
      productionId: '2awY', diaryDetails: { diaryDate: '2026-09-30', rewatch: false }, tags: ['spike'], like: 'liked' in options && options.liked === true,
    });
  }
  await run(gm, filmPage);
  await appListener!(event);
  expect(requests).toHaveLength(sent ? 1 : 0);
  expect(storage.size).toBe(0);
  app.close();
  film.close();
});
