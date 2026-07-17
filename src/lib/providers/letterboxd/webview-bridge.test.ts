import { afterEach, describe, expect, test } from 'bun:test';

import type { LetterboxdWebRequest } from './deps';
import {
  getLetterboxdWebFetch,
  handleLetterboxdMessage,
  letterboxdWebFetch,
  registerLetterboxdWebView,
  resetLetterboxdWebViewBridge,
  setLetterboxdWebViewLoaded,
} from './webview-bridge';

/** A stand-in WebView ref that records every injected script. */
function fakeWebView() {
  const scripts: string[] = [];
  return {
    scripts,
    ref: {
      evaluateJavaScript: async (code: string) => {
        scripts.push(code);
        return 'ok';
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
};

/** Pull the request id the submit script tags its postMessage with. */
function idFromScript(script: string): string {
  const match = /var id = "([^"]+)"/.exec(script);
  if (match == null) throw new Error('no id in script');
  return match[1];
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Drives the navigate → load → submit handshake and returns the submit script. */
async function runToSubmit(webView: ReturnType<typeof fakeWebView>): Promise<string> {
  await flush(); // navigate script dispatched, now awaiting page load
  setLetterboxdWebViewLoaded(true);
  await flush(); // submit script dispatched
  return webView.scripts[webView.scripts.length - 1];
}

afterEach(() => resetLetterboxdWebViewBridge());

describe('letterboxdWebFetch', () => {
  test('rejects when no WebView is mounted', async () => {
    await expect(letterboxdWebFetch(REQUEST)).rejects.toThrow(/not mounted/);
  });

  test('navigates to the film page, then submits its form and resolves', async () => {
    const webView = fakeWebView();
    registerLetterboxdWebView(webView.ref);

    const pending = letterboxdWebFetch(REQUEST);
    const submit = await runToSubmit(webView);

    // First script navigates to the film page (so the CSRF token + LID meta load).
    expect(webView.scripts[0]).toContain('window.location.assign("/film/tuner/")');
    // Second script POSTs the modern JSON API — NOT the dead /s/save-diary-entry form.
    expect(submit).toContain('/api/v0/production-log-entries');
    expect(submit).not.toContain('save-diary-entry');
    expect(submit).toContain('credentials'); // uses the WebView's own session
    // The CSRF token rides in the X-CSRF-TOKEN header from window.supermodelCSRF
    // (what the site submits), with the com.xk72.webparts.csrf cookie as a fallback.
    expect(submit).toContain('X-CSRF-TOKEN');
    expect(submit).toContain('window.supermodelCSRF');
    expect(submit).toContain('com\\.xk72\\.webparts\\.csrf'); // fallback only
    // The film LID (productionId) is read from the page meta, with UH8e as fallback.
    expect(submit).toContain('production:identifier');
    expect(submit).toContain('UH8e');
    expect(submit).toContain('2026-07-17'); // the diary date
    expect(submit).toContain('rewatch-night'); // tags
    expect(submit).toContain('"rewatch":false'); // not a rewatch

    handleLetterboxdMessage(
      JSON.stringify({ id: idFromScript(submit), status: 200, body: '{"logEntry":{}}' }),
    );
    expect(await pending).toEqual({ status: 200, body: '{"logEntry":{}}' });
  });

  test('marks a rewatch when requested', async () => {
    const webView = fakeWebView();
    registerLetterboxdWebView(webView.ref);
    const pending = letterboxdWebFetch({ ...REQUEST, rewatch: true });
    const submit = await runToSubmit(webView);
    expect(submit).toContain('"rewatch":true');
    handleLetterboxdMessage(
      JSON.stringify({ id: idFromScript(submit), status: 200, body: '{}' }),
    );
    await pending;
  });

  test('waits for the film page to load before submitting', async () => {
    const webView = fakeWebView();
    registerLetterboxdWebView(webView.ref);
    const pending = letterboxdWebFetch(REQUEST);
    await flush();
    // Only the navigate script so far — no submit until the page loads.
    expect(webView.scripts.length).toBe(1);

    setLetterboxdWebViewLoaded(true);
    await flush();
    expect(webView.scripts.length).toBe(2);

    handleLetterboxdMessage(
      JSON.stringify({ id: idFromScript(webView.scripts[1]), status: 200, body: '{}' }),
    );
    await pending;
  });

  test('ignores messages that are not ours', async () => {
    const webView = fakeWebView();
    registerLetterboxdWebView(webView.ref);
    const pending = letterboxdWebFetch(REQUEST);
    const submit = await runToSubmit(webView);

    handleLetterboxdMessage('not json');
    handleLetterboxdMessage(JSON.stringify({ id: 'someone-else', status: 200, body: '{}' }));
    handleLetterboxdMessage(
      JSON.stringify({ id: idFromScript(submit), status: 200, body: '{}' }),
    );
    expect((await pending).status).toBe(200);
  });

  test('rejects in-flight writes when the WebView unmounts', async () => {
    const webView = fakeWebView();
    registerLetterboxdWebView(webView.ref);
    const pending = letterboxdWebFetch(REQUEST);
    await flush();

    registerLetterboxdWebView(null);
    await expect(pending).rejects.toThrow(/unmounted/);
  });
});

describe('getLetterboxdWebFetch', () => {
  test('is undefined until a WebView mounts, then the transport', () => {
    expect(getLetterboxdWebFetch()).toBeUndefined();
    registerLetterboxdWebView(fakeWebView().ref);
    expect(getLetterboxdWebFetch()).toBe(letterboxdWebFetch);
  });
});
