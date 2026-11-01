// ==UserScript==
// @name         Shinobu Letterboxd bridge
// @namespace    https://shinobu.glpecile.xyz/
// @version      0.10.0
// @description  Send Shinobu film logs, watchlist changes, new lists and custom list changes through your signed-in Letterboxd tab.
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
  const devOrigin = /^http:\/\/(localhost|127\.0\.0\.1):(8081|8082|19006)$/.test(origin);
  // Local dev servers on these ports are not necessarily Shinobu (8081 is
  // every Expo project's Metro). Developers opt in per install by setting
  // `shinobu-trust-localhost` to true in Tampermonkey's storage tab.
  const appOrigin = origin === 'https://shinobu.glpecile.xyz' ||
    (devOrigin && await GM.getValue('shinobu-trust-localhost', false) === true);

  if (appOrigin) {
    const seen = new Set();
    page.addEventListener('message', async event => {
      if (event.source !== page || event.origin !== origin ||
          !['shinobu-letterboxd-log', 'shinobu-letterboxd-watchlist', 'shinobu-letterboxd-list-like', 'shinobu-letterboxd-list-membership', 'shinobu-letterboxd-list-create', 'shinobu-letterboxd-list-rename'].includes(event.data?.type) || !uuid.test(event.data.id) || seen.has(event.data.id)) return;
      const { id, request } = event.data;
      const watchlist = event.data.type === 'shinobu-letterboxd-watchlist';
      const listLike = event.data.type === 'shinobu-letterboxd-list-like';
      const listMembership = event.data.type === 'shinobu-letterboxd-list-membership';
      const listCreate = event.data.type === 'shinobu-letterboxd-list-create';
      const listRename = event.data.type === 'shinobu-letterboxd-list-rename';
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
        // A fast receipt can arrive before openInTab resolves its tab handle.
        if (response.status >= 200 && response.status < 300) (await tab)?.close();
        page.postMessage({ type: 'shinobu-letterboxd-result', id, response }, origin);
      };
      try {
        if (listCreate) {
          if (!request || !/^[A-Za-z0-9_-]{1,39}$/.test(request.username) || typeof request.name !== 'string' || !request.name.trim() || request.name.length > 500 ||
              typeof request.description !== 'string' || request.description.length > 10000 || !['Public', 'Anyone', 'Friends', 'You'].includes(request.sharing) ||
              typeof request.ranked !== 'boolean' || !Array.isArray(request.tags) || request.tags.length > 100 || request.tags.some(tag => typeof tag !== 'string' || tag.length > 200) ||
              !Array.isArray(request.filmPaths) || request.filmPaths.length > 50 || request.filmPaths.some(path => typeof path !== 'string' || !/^\/(film\/[a-z0-9-]+|tmdb\/[1-9][0-9]*)\/$/.test(path))) {
            throw new Error('Invalid Shinobu list request. Nothing was sent.');
          }
        } else if (listRename) {
          if (!request || !/^[A-Za-z0-9_-]{1,39}$/.test(request.username) || !/^\/[A-Za-z0-9_-]{1,39}\/list\/[a-z0-9-]{1,200}\/$/.test(request.listPath) ||
              typeof request.name !== 'string' || !request.name.trim() || request.name.length > 500) {
            throw new Error('Invalid Shinobu list request. Nothing was sent.');
          }
        } else if (!request || !(listLike || listMembership ? /^\/[A-Za-z0-9_-]{1,39}\/list\/[a-z0-9-]{1,200}\/$/.test(request.listPath) : /^\/(film\/[a-z0-9-]+|tmdb\/[1-9][0-9]*)\/$/.test(request.filmPath)) ||
            !/^[A-Za-z0-9_-]{1,39}$/.test(request.username)) {
          throw new Error('Invalid Shinobu film request. Nothing was sent.');
        }
        if (!listCreate && !listRename && (listMembership ? typeof request.present !== 'boolean' || !/^\/(film\/[a-z0-9-]+|tmdb\/[1-9][0-9]*)\/$/.test(request.filmPath) : listLike ? typeof request.liked !== 'boolean' : watchlist ? typeof request.inWatchlist !== 'boolean' : !/^\d{4}-\d{2}-\d{2}$/.test(request.viewingDateStr) ||
            typeof request.rewatch !== 'boolean' || (request.liked !== undefined && typeof request.liked !== 'boolean') || !Array.isArray(request.tags) || request.tags.length > 100 ||
            request.tags.some(tag => typeof tag !== 'string' || tag.length > 200))) {
          throw new Error('Invalid Shinobu write request. Nothing was sent.');
        }
        if (!watchlist && !listLike && !listMembership && !listCreate && !listRename) {
          const parsedDate = new Date(`${request.viewingDateStr}T12:00:00Z`);
          if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== request.viewingDateStr) {
            throw new Error('Invalid watched date. Nothing was sent.');
          }
        }
        listener = await GM.addValueChangeListener(responseKey, (_key, _old, response) => {
          if (response) void finish(response);
        });
        await GM.setValue(requestKey, { ...request, watchlist, listLike, listMembership, listCreate, listRename, expiresAt: Date.now() + 55_000 });
        timer = setTimeout(() => void finish({ status: 0, body: JSON.stringify({ message: 'Letterboxd bridge timed out. Check Letterboxd before retrying; the write may have succeeded.' }) }), 60_000);
        tab = GM.openInTab(`https://letterboxd.com${listCreate ? '/list/new/' : listMembership || listRename ? request.listPath + 'edit/' : listLike ? request.listPath : request.filmPath}#shinobu-log=${id}`, { active: true, insert: true });
        await tab;
      } catch (error) {
        await finish({ status: 0, body: JSON.stringify({ message: error.message }) });
      }
    });
    page.document.documentElement.setAttribute('data-shinobu-letterboxd-bridge', '11');
    return;
  }

  if (origin !== 'https://letterboxd.com') return;
  const id = new URLSearchParams(page.location.hash.slice(1)).get('shinobu-log');
  if (!id || !uuid.test(id)) return;
  const requestKey = `${prefix}request-${id}`;
  const request = await GM.getValue(requestKey);
  if (!request) return;
  // Consume before writing: reloading this tab must never repeat the write.
  await GM.deleteValue(requestKey);
  let response;
  try {
    if (!Number.isFinite(request.expiresAt) || Date.now() > request.expiresAt) throw new Error('Film request expired. Nothing was sent.');
    if (!page.person?.loggedIn) throw new Error('Sign into Letterboxd, then retry from Shinobu. Nothing was sent.');
    if (page.person.username?.toLowerCase() !== request.username.toLowerCase()) {
      throw new Error(`Letterboxd is signed in as ${page.person.username}, but Shinobu is connected to ${request.username}. Nothing was sent.`);
    }
    if (request.listMembership) {
      const membership = await (async function(){

        if (!page.person || !page.person.loggedIn || page.person.username.toLowerCase() !== request.username.toLowerCase()) throw new Error('Reconnect Letterboxd. Nothing was sent.');
        if (page.location.pathname !== request.listPath + 'edit/') throw new Error('Letterboxd opened a different list. Nothing was sent.');
        if (request.listPath.split('/')[1].toLowerCase() !== request.username.toLowerCase()) throw new Error('You can only edit your own lists. Nothing was sent.');
        var editor = page.document.querySelector('[data-component-class="ListEditor"]');
        var lid = editor && editor.getAttribute('data-list-lid');
        var versionText = editor && editor.getAttribute('data-list-version');
        var version = Number(versionText);
        if (!/^[A-Za-z0-9]+$/.test(lid || '') || editor.getAttribute('data-list-url') !== request.listPath || !versionText || !Number.isSafeInteger(version) || version < 0) throw new Error('Could not read the list editor. Nothing was sent.');
        var csrf = page.supermodelCSRF;
        if (!csrf) throw new Error('Missing page CSRF token. Nothing was sent.');
        async function json(path, init) {
          var result = await page.fetch(path, Object.assign({ credentials: 'include' }, init));
          if (result.headers.get('cf-mitigated') === 'challenge') throw new Error('Letterboxd needs verification. Complete it in the opened tab, then retry.');
          if (!result.ok) throw new Error('Letterboxd could not save the list (HTTP ' + result.status + '). Check the list on Letterboxd before retrying.');
          return result.json();
        }
        var filmResponse = await page.fetch(request.filmPath, { credentials: 'include' });
        if (!filmResponse.ok) throw new Error('Could not resolve the film. Nothing was sent.');
        var filmPage = new page.DOMParser().parseFromString(await filmResponse.text(), 'text/html');
        var film = JSON.parse(filmPage.querySelector('meta[name="production:identifier"]')?.getAttribute('content') || 'null');
        if (!film || film.type !== 'film' || !/^[A-Za-z0-9]+$/.test(film.lid || '')) throw new Error('No film ID found. Nothing was sent.');
        var filmUrl = new URL(filmResponse.url || request.filmPath, page.location.origin);
        if (request.filmPath.startsWith('/tmdb/')) {
          if (filmPage.body.getAttribute('data-tmdb-type') !== 'movie' || filmPage.body.getAttribute('data-tmdb-id') !== request.filmPath.split('/')[2]) throw new Error('Letterboxd returned a different film. Nothing was sent.');
        } else if (filmUrl.pathname !== request.filmPath) throw new Error('Letterboxd returned a different film. Nothing was sent.');
        var slug = filmUrl.pathname.match(/^\/film\/([a-z0-9-]+)\/$/)?.[1];
        if (!slug) throw new Error('No film address found. Nothing was sent.');
        var entriesResponse = await page.fetch('/s/load-list-entries', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ filmListLid: lid, __csrf: csrf }).toString()
        });
        if (!entriesResponse.ok) throw new Error('Could not read list entries. Nothing was sent.');
        var records = (await entriesResponse.text()).trim().split('\n').filter(Boolean).map(function(line){ return JSON.parse(line); });
        var end = records.pop();
        if (!end || end.success !== true || records.some(function(entry){ return !entry.listable || !entry.listable.lid; })) throw new Error('Incomplete list entries. Nothing was sent.');
        var position = records.findIndex(function(entry){ return entry.listable.lid === film.lid; });
        if ((position >= 0) === request.present) return { result: true, present: request.present, filmSlug: slug };
        var receipt = await json('/api/v0/list/' + lid, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-CSRF-TOKEN': csrf },
          body: JSON.stringify({ version: version, entries: [request.present ? { action: 'ADD', listable: film.lid } : { action: 'DELETE', position: position }] })
        });
        if (!Array.isArray(receipt.messages) || receipt.messages.some(function(message){ return message.type === 'Error'; }) || receipt.data?.id !== lid || !Number.isInteger(receipt.data.version) || receipt.data.version <= version) throw new Error('No confirmed list receipt. Open Letterboxd before retrying.');
        return { result: true, present: request.present, filmSlug: slug };
  })();
      response = { status: 200, body: JSON.stringify(membership) };
    } else if (request.listRename) {
      // Mirrors listRenameScript (src/lib/providers/letterboxd/list-editor-scripts.ts).
      if (page.location.pathname !== request.listPath + 'edit/') throw new Error('Letterboxd opened a different list. Nothing was sent.');
      if (request.listPath.split('/')[1].toLowerCase() !== request.username.toLowerCase()) throw new Error('You can only edit your own lists. Nothing was sent.');
      const editor = page.document.querySelector('[data-component-class="ListEditor"]');
      const lid = editor?.getAttribute('data-list-lid');
      const versionText = editor?.getAttribute('data-list-version');
      const version = Number(versionText);
      if (!/^[A-Za-z0-9]+$/.test(lid || '') || editor.getAttribute('data-list-url') !== request.listPath || !versionText || !Number.isSafeInteger(version) || version < 0) throw new Error('Could not read the list editor. Nothing was sent.');
      const tags = JSON.parse(editor.getAttribute('data-list-tags') || '[]');
      const type = editor.getAttribute('data-list-type');
      if (!Array.isArray(tags) || !type) throw new Error('Could not read the list settings. Nothing was sent.');
      const sharing = type === 'public' ? 'Public' : editor.getAttribute('data-list-share-policy') || 'You';
      const csrf = page.supermodelCSRF;
      if (typeof csrf !== 'string' || !csrf) throw new Error('Missing page CSRF token. Nothing was sent.');
      const result = await page.fetch(`/api/v0/list/${lid}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify({
          version, published: sharing === 'Public', sharePolicy: sharing === 'Public' ? 'You' : sharing, name: request.name,
          ranked: editor.getAttribute('data-list-is-ranked') === 'true', description: editor.getAttribute('data-list-description') || '', tags, entries: [],
        }),
      });
      if (result.headers.get('cf-mitigated') === 'challenge') throw new Error('Letterboxd needs verification. Check the list on Letterboxd before retrying.');
      let receipt = null;
      try { receipt = await result.json(); } catch { receipt = null; }
      if (result.status === 400 && receipt?.message) throw new Error(receipt.message);
      if (!result.ok || !Array.isArray(receipt?.messages)) throw new Error(`Letterboxd could not rename the list (HTTP ${result.status}). Check the list before retrying.`);
      const error = receipt.messages.find(message => message.type === 'Error');
      if (error) throw new Error(error.title || 'Letterboxd rejected the name.');
      const link = Array.isArray(receipt.data?.links) ? receipt.data.links.find(entry => entry.type === 'letterboxd') : null;
      const listPath = link ? new URL(link.url, page.location.origin).pathname : '';
      if (receipt.data.id !== lid || !(receipt.data.version > version) || !/^\/[A-Za-z0-9_-]{1,39}\/list\/[a-z0-9-]{1,200}\/$/.test(listPath) || listPath.split('/')[1].toLowerCase() !== request.username.toLowerCase()) {
        throw new Error('Letterboxd did not confirm the new name. Check the list before retrying.');
      }
      response = { status: 200, body: JSON.stringify({ result: true, listPath }) };
    } else if (request.listCreate) {
      // Mirrors listCreateScript (src/lib/providers/letterboxd/list-editor-scripts.ts).
      if (page.location.pathname !== '/list/new/') throw new Error('Letterboxd opened a different page. Nothing was sent.');
      const csrf = page.supermodelCSRF;
      if (typeof csrf !== 'string' || !csrf) throw new Error('Missing page CSRF token. Nothing was sent.');
      const resolveFilm = async filmPath => {
        const filmResponse = await page.fetch(filmPath, { credentials: 'include' });
        if (!filmResponse.ok) throw new Error('Could not resolve a film. Nothing was sent.');
        const filmPage = new page.DOMParser().parseFromString(await filmResponse.text(), 'text/html');
        const film = JSON.parse(filmPage.querySelector('meta[name="production:identifier"]')?.getAttribute('content') || 'null');
        if (film?.type !== 'film' || !/^[A-Za-z0-9]+$/.test(film.lid || '')) throw new Error('No film ID found. Nothing was sent.');
        const filmUrl = new URL(filmResponse.url || filmPath, page.location.origin);
        const matches = filmPath.startsWith('/tmdb/')
          ? filmPage.body.getAttribute('data-tmdb-type') === 'movie' && filmPage.body.getAttribute('data-tmdb-id') === filmPath.split('/')[2]
          : filmUrl.pathname === filmPath;
        if (!matches) throw new Error('Letterboxd returned a different film. Nothing was sent.');
        return film.lid;
      };
      const lids = [];
      // A few at a time: one page per film, without a burst Cloudflare scores.
      for (let start = 0; start < request.filmPaths.length; start += 4) {
        for (const lid of await Promise.all(request.filmPaths.slice(start, start + 4).map(resolveFilm))) if (!lids.includes(lid)) lids.push(lid);
      }
      const result = await page.fetch('/api/v0/lists', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify({
          published: request.sharing === 'Public', sharePolicy: request.sharing === 'Public' ? 'You' : request.sharing,
          name: request.name, description: request.description, ranked: request.ranked, tags: request.tags,
          entries: lids.map(lid => ({ action: 'ADD', listable: lid })),
        }),
      });
      if (result.headers.get('cf-mitigated') === 'challenge') throw new Error('Letterboxd needs verification. Check your lists on Letterboxd before retrying.');
      let receipt = null;
      try { receipt = await result.json(); } catch { receipt = null; }
      if (result.status === 400 && receipt?.message) throw new Error(receipt.message);
      if (!result.ok || !Array.isArray(receipt?.messages)) throw new Error(`Letterboxd could not create the list (HTTP ${result.status}). Check your lists before retrying.`);
      const error = receipt.messages.find(message => message.type === 'Error');
      if (error) throw new Error(error.title || 'Letterboxd rejected the list.');
      const link = Array.isArray(receipt.data?.links) ? receipt.data.links.find(entry => entry.type === 'letterboxd') : null;
      const listPath = link ? new URL(link.url, page.location.origin).pathname : '';
      if (!/^\/[A-Za-z0-9_-]{1,39}\/list\/[a-z0-9-]{1,200}\/$/.test(listPath) || listPath.split('/')[1].toLowerCase() !== request.username.toLowerCase()) {
        throw new Error('Letterboxd did not confirm the new list. Check your lists before retrying.');
      }
      response = { status: 200, body: JSON.stringify({ result: true, listPath }) };
    } else if (request.listLike) {
      if (page.location.pathname !== request.listPath) throw new Error('Letterboxd opened a different list. Nothing was sent.');
      const panel = page.document.querySelector('#userpanel[data-list-identifier]');
      const list = JSON.parse(panel?.getAttribute('data-list-identifier') ?? 'null');
      if (list?.type !== 'list' || !/^filmlist:[1-9][0-9]*$/.test(list.uid)) throw new Error('No Letterboxd list ID found. Nothing was sent.');
      if (panel.getAttribute('data-owner')?.toLowerCase() === page.person.username.toLowerCase()) throw new Error('You cannot like your own list. Nothing was sent.');
      if (request.liked && !page.person.trusted) throw new Error('Like this list on Letterboxd to complete its verification. Nothing was sent.');
      if (!page.supermodelCSRF) throw new Error('Missing page CSRF token. Nothing was sent.');
      const result = await page.fetch(`/s/${list.uid}/like/`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ liked: String(request.liked), __csrf: page.supermodelCSRF }).toString(),
      });
      const receipt = await result.json();
      if (!result.ok || receipt.result !== true || receipt.liked !== request.liked) throw new Error('No confirmed like receipt. Check Letterboxd before retrying.');
      response = { status: result.status, body: JSON.stringify({ result: true, liked: receipt.liked }) };
    } else {
      const film = JSON.parse(page.document.querySelector('meta[name="production:identifier"]')?.content ?? 'null');
      if (film?.type !== 'film' || !/^[A-Za-z0-9]+$/.test(film?.lid ?? '')) throw new Error('No Letterboxd film ID found. Nothing was sent.');
      const matchesFilm = request.filmPath.startsWith('/tmdb/')
        ? page.document.body.dataset.tmdbType === 'movie' && page.document.body.dataset.tmdbId === request.filmPath.split('/')[2]
        : page.location.pathname === request.filmPath;
      if (!matchesFilm) throw new Error('Letterboxd opened a different film. Nothing was sent.');
      const csrf = page.supermodelCSRF;
      if (typeof csrf !== 'string' || !csrf) throw new Error('Missing page CSRF token. Nothing was sent.');
      const result = await page.fetch(request.watchlist ? `/api/v0/me/watchlist/${film.lid}` : '/api/v0/production-log-entries', {
        method: request.watchlist ? 'PATCH' : 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify(request.watchlist ? { inWatchlist: request.inWatchlist } : { productionId: film.lid, diaryDetails: { diaryDate: request.viewingDateStr, rewatch: request.rewatch }, tags: request.tags, like: request.liked === true }),
      });
      const text = await result.text();
      if (!result.ok) {
        const challenged = result.headers.get('cf-mitigated') === 'challenge' || /<title>Just a moment/i.test(text);
        throw new Error(`Letterboxd returned HTTP ${result.status}${challenged ? ' (Cloudflare challenge)' : ''}. Check Letterboxd before retrying.`);
      }
      if (request.watchlist) {
        // Like the native adapter, accept successful PATCH statuses, not only 204.
        if (text.trim()) {
          let receipt;
          try { receipt = JSON.parse(text); } catch { throw new Error('Non-JSON response. Check Letterboxd before retrying; the write may have succeeded.'); }
          const errors = (receipt.messages ?? []).filter(message => message.type === 'Error');
          if (errors.length) throw new Error(errors.map(message => message.title ?? message.text ?? 'Watchlist rejected').join('; '));
          if (receipt.result === false) throw new Error('Watchlist rejected. Check Letterboxd before retrying.');
        }
        response = { status: result.status, body: '' };
      } else {
        let receipt;
        try { receipt = JSON.parse(text); } catch { throw new Error('Non-JSON response. Check Letterboxd before retrying; the log may have succeeded.'); }
        const errors = (receipt.messages ?? []).filter(message => message.type === 'Error');
        if (errors.length) throw new Error(errors.map(message => message.title ?? message.text ?? 'Log rejected').join('; '));
        if (!receipt.logEntry) throw new Error('No log receipt. Check Letterboxd before retrying; the log may have succeeded.');
        response = { status: result.status, body: JSON.stringify({ logEntry: { id: receipt.logEntry.id }, messages: [] }) };
      }
    }
  } catch (error) {
    response = { status: 0, body: JSON.stringify({ message: error.message }) };
  }
  await GM.setValue(`${prefix}response-${id}`, response);
})();
