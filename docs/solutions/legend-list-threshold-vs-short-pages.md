# Legend List threshold vs short pages: scroll twice per page

## Symptom

On web the lists index (`/lists/letterboxd?kind=liked`) needed two scrolls per
page: scroll to the bottom and nothing loads; scroll up and back down and the
next page arrives. Bumping `onEndReachedThreshold` to 0.6 (the poster wall /
diary value) made it worse, not better.

## Cause

`@legendapp/list` latches the end edge once it fires (`checkThreshold` in
`react-native.web.js`): it re-arms only when the scroll position leaves
1.3× the threshold band, and a landed page does not clear the latch by itself
(it only refreshes the snapshot). One index page is 12 lists — three rows,
~564px on a four-column grid.

- At 0.6 on a 900px viewport the band is 540px and the re-arm distance is
  702px. A landed 564px page never exits it, so every page stalls until the
  user scrolls out past 702px and back in: scroll twice, forever.
- At the 0.5 default the re-arm distance is 585px — still past one page, same
  stall on typical viewports.

Tall pages (diary, poster wall) never notice: a landed page clears any band on
its own, so 0.6 chains fine there. The threshold has to fit the page height,
not the screen.

## Fix

`lists-grid.tsx` uses `onEndReachedThreshold={0.3}`: the trigger sits
240–330px before the end (comfortable to hit) while the 351–429px re-arm band
clears on every landed 564px page, so one scroll loads one page. The same edit
sets `estimatedItemSize` to the true row height (h-44 card + mb-3 = 188), which
also silences the web "creating one on demand … estimatedItemSize too large"
container-pool warning.

Rule of thumb: keep `1.3 × threshold × viewport < one page of content`, or the
latch from the previous page is still set when the next one lands.
