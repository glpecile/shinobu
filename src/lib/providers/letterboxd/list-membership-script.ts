import type { LetterboxdListMembershipRequest } from './deps';

/** Runs in the authenticated page; positions come from a fresh, complete stream. */
export function listMembershipScript(request: LetterboxdListMembershipRequest): string {
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
    var csrf = window.supermodelCSRF;
    if (!csrf) throw new Error('Missing page CSRF token. Nothing was sent.');
    async function json(path, init) {
      var response = await fetch(path, Object.assign({ credentials: 'include' }, init));
      if (response.headers.get('cf-mitigated') === 'challenge') throw new Error('Letterboxd needs verification. Complete it in the opened tab, then retry.');
      if (!response.ok) throw new Error('Letterboxd could not save the list (HTTP ' + response.status + '). Check the list on Letterboxd before retrying.');
      return response.json();
    }
    var filmResponse = await fetch(request.filmPath, { credentials: 'include' });
    if (!filmResponse.ok) throw new Error('Could not resolve the film. Nothing was sent.');
    var filmPage = new DOMParser().parseFromString(await filmResponse.text(), 'text/html');
    var film = JSON.parse(filmPage.querySelector('meta[name="production:identifier"]')?.getAttribute('content') || 'null');
    if (!film || film.type !== 'film' || !/^[A-Za-z0-9]+$/.test(film.lid || '')) throw new Error('No film ID found. Nothing was sent.');
    var filmUrl = new URL(filmResponse.url || request.filmPath, window.location.origin);
    if (request.filmPath.startsWith('/tmdb/')) {
      if (filmPage.body.getAttribute('data-tmdb-type') !== 'movie' || filmPage.body.getAttribute('data-tmdb-id') !== request.filmPath.split('/')[2]) throw new Error('Letterboxd returned a different film. Nothing was sent.');
    } else if (filmUrl.pathname !== request.filmPath) throw new Error('Letterboxd returned a different film. Nothing was sent.');
    var slug = filmUrl.pathname.match(/^\\/film\\/([a-z0-9-]+)\\/$/)?.[1];
    if (!slug) throw new Error('No film address found. Nothing was sent.');
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
