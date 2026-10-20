import type { LetterboxdListCreateRequest, LetterboxdListMembershipRequest, LetterboxdListRenameRequest } from './deps';

/**
 * Resolves a `/film/…/` or `/tmdb/…/` path to its LID and canonical slug in the
 * signed-in page, refusing a redirect to a different film.
 */
export const RESOLVE_FILM = `async function resolveFilm(filmPath) {
      var filmResponse = await fetch(filmPath, { credentials: 'include' });
      if (!filmResponse.ok) throw new Error('Could not resolve the film. Nothing was sent.');
      var filmPage = new DOMParser().parseFromString(await filmResponse.text(), 'text/html');
      var film = JSON.parse(filmPage.querySelector('meta[name="production:identifier"]')?.getAttribute('content') || 'null');
      if (!film || film.type !== 'film' || !/^[A-Za-z0-9]+$/.test(film.lid || '')) throw new Error('No film ID found. Nothing was sent.');
      var filmUrl = new URL(filmResponse.url || filmPath, window.location.origin);
      if (filmPath.startsWith('/tmdb/')) {
        if (filmPage.body.getAttribute('data-tmdb-type') !== 'movie' || filmPage.body.getAttribute('data-tmdb-id') !== filmPath.split('/')[2]) throw new Error('Letterboxd returned a different film. Nothing was sent.');
      } else if (filmUrl.pathname !== filmPath) throw new Error('Letterboxd returned a different film. Nothing was sent.');
      var slug = filmUrl.pathname.match(/^\\/film\\/([a-z0-9-]+)\\/$/)?.[1];
      if (!slug) throw new Error('No film address found. Nothing was sent.');
      return { film: film, slug: slug };
    }`;

/** Runs in the authenticated page; positions come from a fresh, complete stream. */
export function listMembershipScript(request: LetterboxdListMembershipRequest): string {
  return `(async function(){
    var request = ${JSON.stringify(request)};
    ${RESOLVE_FILM}
    if (!window.person || !window.person.loggedIn || window.person.username.toLowerCase() !== request.username.toLowerCase()) throw new Error('Reconnect Letterboxd. Nothing was sent.');
    if (window.location.pathname !== request.listPath + 'edit/') throw new Error('Letterboxd opened a different list. Nothing was sent.');
    if (request.listPath.split('/')[1].toLowerCase() !== request.username.toLowerCase()) throw new Error('You can only edit your own lists. Nothing was sent.');
    var editor = document.querySelector('[data-component-class="ListEditor"]');
    var lid = editor && editor.getAttribute('data-list-lid');
    var versionText = editor && editor.getAttribute('data-list-version');
    var version = Number(versionText);
    if (!/^[A-Za-z0-9]+$/.test(lid || '') || editor.getAttribute('data-list-url') !== request.listPath || !versionText || !Number.isSafeInteger(version) || version < 0) throw new Error('Could not read the list editor. Nothing was sent.');
    var csrf = window.supermodelCSRF;
    if (!csrf) throw new Error('Missing page CSRF token. Nothing was sent.');
    async function json(path, init) {
      var response = await fetch(path, Object.assign({ credentials: 'include' }, init));
      if (response.headers.get('cf-mitigated') === 'challenge') throw new Error('Letterboxd needs verification. Complete it in the opened tab, then retry.');
      if (!response.ok) throw new Error('Letterboxd could not save the list (HTTP ' + response.status + '). Check the list on Letterboxd before retrying.');
      return response.json();
    }
    var resolved = await resolveFilm(request.filmPath);
    var film = resolved.film;
    var slug = resolved.slug;
    var response = await fetch('/s/load-list-entries', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ filmListLid: lid, __csrf: csrf }).toString()
    });
    if (!response.ok) throw new Error('Could not read list entries. Nothing was sent.');
    var records = (await response.text()).trim().split('\\n').filter(Boolean).map(function(line){ return JSON.parse(line); });
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
  })()`;
}

/**
 * Runs on the signed-in `/list/new/` page and saves through the editor's own
 * `POST /api/v0/lists` (plan 0097). Every film resolves before anything is sent.
 */
export function listCreateScript(request: LetterboxdListCreateRequest): string {
  return `(async function(){
    var request = ${JSON.stringify(request)};
    ${RESOLVE_FILM}
    if (!window.person || !window.person.loggedIn || window.person.username.toLowerCase() !== request.username.toLowerCase()) throw new Error('Reconnect Letterboxd. Nothing was sent.');
    if (window.location.pathname !== '/list/new/') throw new Error('Letterboxd opened a different page. Nothing was sent.');
    var csrf = window.supermodelCSRF;
    if (!csrf) throw new Error('Missing page CSRF token. Nothing was sent.');
    var lids = [];
    // A few at a time: one page per film, without a burst Cloudflare scores.
    for (var start = 0; start < request.filmPaths.length; start += 4) {
      var batch = await Promise.all(request.filmPaths.slice(start, start + 4).map(resolveFilm));
      batch.forEach(function(resolved){ if (lids.indexOf(resolved.film.lid) < 0) lids.push(resolved.film.lid); });
    }
    var response = await fetch('/api/v0/lists', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-CSRF-TOKEN': csrf },
      body: JSON.stringify({
        published: request.sharing === 'Public', sharePolicy: request.sharing === 'Public' ? 'You' : request.sharing,
        name: request.name, description: request.description, ranked: request.ranked, tags: request.tags,
        entries: lids.map(function(lid){ return { action: 'ADD', listable: lid }; })
      })
    });
    if (response.headers.get('cf-mitigated') === 'challenge') throw new Error('Letterboxd needs verification. Check your lists on Letterboxd before retrying.');
    var receipt = await response.json().catch(function(){ return null; });
    if (response.status === 400 && receipt && receipt.message) throw new Error(receipt.message);
    if (!response.ok || !receipt || !Array.isArray(receipt.messages)) throw new Error('Letterboxd could not create the list (HTTP ' + response.status + '). Check your lists before retrying.');
    var error = receipt.messages.find(function(message){ return message.type === 'Error'; });
    if (error) throw new Error(error.title || 'Letterboxd rejected the list.');
    var link = receipt.data && Array.isArray(receipt.data.links) && receipt.data.links.find(function(entry){ return entry.type === 'letterboxd'; });
    var listPath = link && new URL(link.url, window.location.origin).pathname;
    if (!listPath || !/^\\/[A-Za-z0-9_-]{1,39}\\/list\\/[a-z0-9-]{1,200}\\/$/.test(listPath) || listPath.split('/')[1].toLowerCase() !== request.username.toLowerCase()) throw new Error('Letterboxd did not confirm the new list. Check your lists before retrying.');
    return { result: true, listPath: listPath };
  })()`;
}

/**
 * Renames on the list's own editor page. The PATCH resends every setting the
 * editor was rendered with (its `data-list-*` attributes), so only the name
 * changes. A rename can change the slug; the receipt carries the new path.
 */
export function listRenameScript(request: LetterboxdListRenameRequest): string {
  return `(async function(){
    var request = ${JSON.stringify(request)};
    if (!window.person || !window.person.loggedIn || window.person.username.toLowerCase() !== request.username.toLowerCase()) throw new Error('Reconnect Letterboxd. Nothing was sent.');
    if (window.location.pathname !== request.listPath + 'edit/') throw new Error('Letterboxd opened a different list. Nothing was sent.');
    if (request.listPath.split('/')[1].toLowerCase() !== request.username.toLowerCase()) throw new Error('You can only edit your own lists. Nothing was sent.');
    var editor = document.querySelector('[data-component-class="ListEditor"]');
    var lid = editor && editor.getAttribute('data-list-lid');
    var versionText = editor && editor.getAttribute('data-list-version');
    var version = Number(versionText);
    if (!/^[A-Za-z0-9]+$/.test(lid || '') || editor.getAttribute('data-list-url') !== request.listPath || !versionText || !Number.isSafeInteger(version) || version < 0) throw new Error('Could not read the list editor. Nothing was sent.');
    var tags = JSON.parse(editor.getAttribute('data-list-tags') || '[]');
    var type = editor.getAttribute('data-list-type');
    if (!Array.isArray(tags) || !type) throw new Error('Could not read the list settings. Nothing was sent.');
    var sharing = type === 'public' ? 'Public' : editor.getAttribute('data-list-share-policy') || 'You';
    var csrf = window.supermodelCSRF;
    if (!csrf) throw new Error('Missing page CSRF token. Nothing was sent.');
    var response = await fetch('/api/v0/list/' + lid, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-CSRF-TOKEN': csrf },
      body: JSON.stringify({
        version: version, published: sharing === 'Public', sharePolicy: sharing === 'Public' ? 'You' : sharing, name: request.name,
        ranked: editor.getAttribute('data-list-is-ranked') === 'true', description: editor.getAttribute('data-list-description') || '', tags: tags, entries: []
      })
    });
    if (response.headers.get('cf-mitigated') === 'challenge') throw new Error('Letterboxd needs verification. Check the list on Letterboxd before retrying.');
    var receipt = await response.json().catch(function(){ return null; });
    if (response.status === 400 && receipt && receipt.message) throw new Error(receipt.message);
    if (!response.ok || !receipt || !Array.isArray(receipt.messages)) throw new Error('Letterboxd could not rename the list (HTTP ' + response.status + '). Check the list before retrying.');
    var error = receipt.messages.find(function(message){ return message.type === 'Error'; });
    if (error) throw new Error(error.title || 'Letterboxd rejected the name.');
    var link = receipt.data && Array.isArray(receipt.data.links) && receipt.data.links.find(function(entry){ return entry.type === 'letterboxd'; });
    var listPath = link && new URL(link.url, window.location.origin).pathname;
    if (receipt.data.id !== lid || !(receipt.data.version > version) || !listPath || !/^\\/[A-Za-z0-9_-]{1,39}\\/list\\/[a-z0-9-]{1,200}\\/$/.test(listPath) || listPath.split('/')[1].toLowerCase() !== request.username.toLowerCase()) throw new Error('Letterboxd did not confirm the new name. Check the list before retrying.');
    return { result: true, listPath: listPath };
  })()`;
}
