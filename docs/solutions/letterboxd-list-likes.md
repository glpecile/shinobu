# Letterboxd list likes

The public list page and current site JS were inspected on 2026-10-08.
`ListSidebar` reads `data-list-identifier` from `#userpanel`; its identifier has
`type: "list"` and `uid: "filmlist:<numeric id>"`. The shared LikeComponent sends
`POST /s/<uid>/like/` as form data with `liked=true/false` and `__csrf` from
`window.supermodelCSRF`. A successful JSON receipt has `result: true` and the
confirmed `liked` value. HTTP 200 alone is not success.

The site's LikeComponent requests captcha for a like by an untrusted member.
Shinobu must leave that action on Letterboxd, not omit or bypass the challenge.
Unlikes need no captcha. Both transports validate the loaded page and signed-in
username before writing, and consume the request before sending to avoid replay.
The existing Worker remains GET-only; no cookies leave the browser/WebView.

These findings describe the site's current contract, not an official API.

## iOS validation

The captured `glptest` test session successfully liked and then unliked Jack's
“50 Classics to Rewatch in 2026” list. Both mutations returned confirmed JSON
receipts; the UI changed between Like list and Unlike list. The temporary like
was removed. Loading/error feedback and the external recovery action rendered.

Initial attempts exhausted the native bridge's 20-second budget. That timer
includes loading an entire authenticated page before its document-end write,
not just the POST. The bridge now allows 60 seconds, matching the userscript's
budget, with no automatic retries. Public Bun reads of the test member's liked
index were also challenged; reads retain the existing retry/external fallback.

Removing temporary NitroWebView load callbacks during Fast Refresh produced
`onLoadStart: Value is null, expected an Object`. A full JS reload cleared it;
the shipped bridge has no load callbacks, and no native rebuild was needed.
