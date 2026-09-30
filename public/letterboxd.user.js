// ==UserScript==
// @name         Shinobu Letterboxd bridge
// @namespace    https://shinobu.glpecile.xyz/
// @version      0.3.0
// @description  Send Shinobu film logs through your signed-in Letterboxd tab.
// @match        https://shinobu.glpecile.xyz/*
// @match        http://localhost/*
// @match        http://127.0.0.1/*
// @match        https://letterboxd.com/*
// @run-at       document-idle
// @noframes
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.addValueChangeListener
// @grant        GM.removeValueChangeListener
// @grant        GM.openInTab
// @grant        unsafeWindow
// ==/UserScript==

(async () => {
  'use strict';
  const page = unsafeWindow;
  const origin = page.location.origin;
  const prefix = 'shinobu-letterboxd-';
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  const appOrigin = origin === 'https://shinobu.glpecile.xyz' ||
    /^http:\/\/(localhost|127\.0\.0\.1):(8081|19006)$/.test(origin);

  if (appOrigin) {
    const seen = new Set();
    page.addEventListener('message', async event => {
      if (event.source !== page || event.origin !== origin ||
          event.data?.type !== 'shinobu-letterboxd-log' || !uuid.test(event.data.id) || seen.has(event.data.id)) return;
      const { id, request } = event.data;
      seen.add(id);
      const requestKey = `${prefix}request-${id}`;
      const responseKey = `${prefix}response-${id}`;
      let listener;
      let timer;
      let tab;
      const finish = async response => {
        clearTimeout(timer);
        if (listener !== undefined) await GM.removeValueChangeListener(listener);
        await GM.deleteValue(requestKey);
        await GM.deleteValue(responseKey);
        page.postMessage({ type: 'shinobu-letterboxd-result', id, response }, origin);
        if (response.status >= 200 && response.status < 300) tab?.close();
      };
      try {
        if (!request || !/^\/(film\/[a-z0-9-]+|tmdb\/[1-9][0-9]*)\/$/.test(request.filmPath) ||
            !/^[A-Za-z0-9_-]{1,39}$/.test(request.username) || !/^\d{4}-\d{2}-\d{2}$/.test(request.viewingDateStr) ||
            typeof request.rewatch !== 'boolean' || !Array.isArray(request.tags) || request.tags.length > 100 ||
            request.tags.some(tag => typeof tag !== 'string' || tag.length > 200)) {
          throw new Error('Invalid Shinobu film-log request. Nothing was sent.');
        }
        const parsedDate = new Date(`${request.viewingDateStr}T12:00:00Z`);
        if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== request.viewingDateStr) {
          throw new Error('Invalid watched date. Nothing was sent.');
        }
        listener = await GM.addValueChangeListener(responseKey, (_key, _old, response) => {
          if (response) void finish(response);
        });
        await GM.setValue(requestKey, { ...request, expiresAt: Date.now() + 55_000 });
        timer = setTimeout(() => void finish({ status: 0, body: JSON.stringify({ message: 'Letterboxd bridge timed out. Check Letterboxd before retrying; the log may have succeeded.' }) }), 60_000);
        tab = await GM.openInTab(`https://letterboxd.com${request.filmPath}#shinobu-log=${id}`, { active: true, insert: true });
      } catch (error) {
        await finish({ status: 0, body: JSON.stringify({ message: error.message }) });
      }
    });
    page.document.documentElement.setAttribute('data-shinobu-letterboxd-bridge', '3');
    return;
  }

  if (origin !== 'https://letterboxd.com') return;
  const id = new URLSearchParams(page.location.hash.slice(1)).get('shinobu-log');
  if (!id || !uuid.test(id)) return;
  const requestKey = `${prefix}request-${id}`;
  const request = await GM.getValue(requestKey);
  if (!request) return;
  // Consume before writing: reloading this tab must never create another log.
  await GM.deleteValue(requestKey);
  let response;
  try {
    if (!Number.isFinite(request.expiresAt) || Date.now() > request.expiresAt) throw new Error('Film-log request expired. Nothing was sent.');
    if (!page.person?.loggedIn) throw new Error('Sign into Letterboxd, then retry from Shinobu. Nothing was sent.');
    if (page.person.username?.toLowerCase() !== request.username.toLowerCase()) {
      throw new Error(`Letterboxd is signed in as ${page.person.username}, but Shinobu is connected to ${request.username}. Nothing was sent.`);
    }
    const film = JSON.parse(page.document.querySelector('meta[name="production:identifier"]')?.content ?? 'null');
    if (film?.type !== 'film' || !/^[A-Za-z0-9]+$/.test(film?.lid ?? '')) throw new Error('No Letterboxd film ID found. Nothing was sent.');
    const matchesFilm = request.filmPath.startsWith('/tmdb/')
      ? page.document.body.dataset.tmdbType === 'movie' && page.document.body.dataset.tmdbId === request.filmPath.split('/')[2]
      : page.location.pathname === request.filmPath;
    if (!matchesFilm) throw new Error('Letterboxd opened a different film. Nothing was sent.');
    const csrf = page.supermodelCSRF;
    if (typeof csrf !== 'string' || !csrf) throw new Error('Missing page CSRF token. Nothing was sent.');
    const result = await page.fetch('/api/v0/production-log-entries', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-CSRF-TOKEN': csrf },
      body: JSON.stringify({ productionId: film.lid, diaryDetails: { diaryDate: request.viewingDateStr, rewatch: request.rewatch }, tags: request.tags, like: false }),
    });
    const text = await result.text();
    if (!result.ok) {
      const challenged = result.headers.get('cf-mitigated') === 'challenge' || /<title>Just a moment/i.test(text);
      throw new Error(`Letterboxd returned HTTP ${result.status}${challenged ? ' (Cloudflare challenge)' : ''}. Check Letterboxd before retrying.`);
    }
    let receipt;
    try { receipt = JSON.parse(text); } catch { throw new Error('Non-JSON response. Check Letterboxd before retrying; the log may have succeeded.'); }
    const errors = (receipt.messages ?? []).filter(message => message.type === 'Error');
    if (errors.length) throw new Error(errors.map(message => message.title ?? message.text ?? 'Log rejected').join('; '));
    if (!receipt.logEntry) throw new Error('No log receipt. Check Letterboxd before retrying; the log may have succeeded.');
    response = { status: result.status, body: JSON.stringify({ logEntry: { id: receipt.logEntry.id }, messages: [] }) };
  } catch (error) {
    response = { status: 0, body: JSON.stringify({ message: error.message }) };
  }
  await GM.setValue(`${prefix}response-${id}`, response);
})();
