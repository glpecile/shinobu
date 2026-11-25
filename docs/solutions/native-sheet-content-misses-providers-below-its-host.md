# A native sheet's content only sees providers above `SheetProvider`

**Found 2026-11-25** on a Pixel 8 Pro. The log sheet called `openLog` from
`useCatchUpControls()` to continue into an anime's sequel, and nothing
happened. The same call from outside the sheet opened it.

## What happened

`@swmansion/react-native-bottom-sheet` renders every sheet's content at the
portal host inside `BottomSheetProvider`, which is `SheetProvider` in
`app/_layout.tsx`. React context follows the host, not the place where the
`<Sheet>` is written. `SheetProvider` wrapped `CatchUpLogProvider`, so content
inside a native sheet read that context's default value. The default is a set
of no-op functions, so `openLog`, `trackLog` and `trackBusy` failed without an
error. Web uses the Modal fallback, which keeps context, so web worked.

## The fix

`SheetProvider` sits inside `LightboxProvider` and `CatchUpLogProvider`. A
provider that sheet content reads goes above `SheetProvider`.

## Watch for

A context whose default is a no-op hides this. When a call from inside a sheet
does nothing on native and works on web, compare the context value the sheet's
fiber reads with the provider's.
