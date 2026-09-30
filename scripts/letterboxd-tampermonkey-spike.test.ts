import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';

const script = await Bun.file(new URL('../public/letterboxd.user.js', import.meta.url)).text();
const run = new Function('GM', 'unsafeWindow', `return ${script.slice(script.indexOf('(async ()'))}`);
const id = '12345678-1234-1234-1234-123456789abc';

test.each([
  { name: 'hands a Shinobu log to the Letterboxd tab and returns its receipt', username: 'gian', path: '/film/alien/', status: 200, body: '{"logEntry":{"id":"abc"}}', sent: true, message: 'abc' },
  { name: 'resolves a TMDB redirect in the browser', username: 'gian', path: '/tmdb/348/', status: 200, body: '{"logEntry":{"id":"abc"}}', sent: true, message: 'abc' },
  { name: 'refuses to log to a different account', username: 'other', path: '/film/alien/', status: 200, body: '{}', sent: false, message: 'signed in as other' },
  { name: 'refuses a different film', username: 'gian', path: '/film/wrong-film/', status: 200, body: '{}', sent: false, message: 'different film' },
  { name: 'returns a challenge as a failure without retrying', username: 'gian', path: '/film/alien/', status: 403, body: '<title>Just a moment...</title>', sent: true, message: 'Cloudflare challenge' },
  { name: 'does not treat validation errors as success', username: 'gian', path: '/film/alien/', status: 200, body: '{"messages":[{"type":"Error","text":"Invalid film"}]}', sent: true, message: 'Invalid film' },
  { name: 'does not treat an empty response as a receipt', username: 'gian', path: '/film/alien/', status: 200, body: '{}', sent: true, message: 'No log receipt' },
])('$name', async ({ username, path, status, body, sent, message }) => {
  const app = new Window({ url: 'http://localhost:8081/' });
  const film = new Window({ url: `https://letterboxd.com/film/alien/#shinobu-log=${id}` });
  film.document.body.innerHTML = `<meta name="production:identifier" content='{"lid":"2awY","type":"film"}'>`;
  film.document.body.dataset.tmdbType = 'movie';
  film.document.body.dataset.tmdbId = '348';
  const storage = new Map<string, unknown>();
  let storageListener: ((key: string, old: unknown, value: unknown) => void) | undefined;
  let appListener: (event: unknown) => Promise<void>;
  let receive!: (response: { status: number; body: string }) => void;
  const result = new Promise<{ status: number; body: string }>(resolve => { receive = resolve; });
  const requests: RequestInit[] = [];
  const appPage = {
    location: app.location, document: app.document,
    addEventListener: (_name: string, callback: typeof appListener) => { appListener = callback; },
    postMessage: (data: { response: { status: number; body: string } }) => receive(data.response),
  };
  const filmPage = {
    location: film.location, document: film.document,
    person: { loggedIn: true, username }, supermodelCSRF: 'test-csrf',
    fetch: async (_url: string, init: RequestInit) => { requests.push(init); return new Response(body, { status }); },
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
      return { close() {} };
    },
  };
  await run(gm, appPage);
  expect(app.document.documentElement.getAttribute('data-shinobu-letterboxd-bridge')).toBe('3');
  const event = { source: appPage, origin: app.location.origin, data: {
    type: 'shinobu-letterboxd-log', id,
    request: { username: 'gian', filmPath: path, viewingDateStr: '2026-09-30', rewatch: false, tags: ['spike'] },
  } };
  await appListener!(event);
  const response = await result;
  expect(response.status).toBe(message === 'abc' ? 200 : 0);
  expect(response.body).toContain(message);
  expect(requests).toHaveLength(sent ? 1 : 0);
  if (sent) {
    expect(requests[0].credentials).toBe('include');
    expect(JSON.parse(String(requests[0].body))).toEqual({
      productionId: '2awY', diaryDetails: { diaryDate: '2026-09-30', rewatch: false }, tags: ['spike'], like: false,
    });
  }
  await run(gm, filmPage);
  await appListener!(event);
  expect(requests).toHaveLength(sent ? 1 : 0);
  expect(storage.size).toBe(0);
  app.close();
  film.close();
});
