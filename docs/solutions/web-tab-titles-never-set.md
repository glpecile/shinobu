# Web tab screens never set the browser title

**Symptom:** open a pushed page (anime seasons, a details screen), then go
back Home from the sidebar: the tab keeps that page's title. A fresh load of
`/` or `/diary` has an empty title and no description meta.

**Cause:** `expo-router/head` renders its Helmet only while `useIsFocused()` is
true. The web tabs layout renders screens through a custom `<Navigator>` +
`Navigator.Slot`, and `Navigator.Slot` renders the focused descriptor *without*
the builder's `NavigationContent` wrapper (`SlotNavigator` has it). With that
wrapper missing, focus never resolves true for a tab screen, so no tab `<Head>`
mounts. Helmet only writes `document.title` when some mounted Helmet supplies a
title, so once the pushed page unmounts, nothing replaces its title.

**Fix:** wrap the slot in the context's `NavigationContent`
(`src/app/(tabs)/_layout.web.tsx`):

```tsx
const { state, NavigationContent } = Navigator.useContext();
<NavigationContent><Navigator.Slot /></NavigationContent>
```

**Check:** in headless Chrome, `document.title` reads `Shinobu` on `/` and
`Diary — Shinobu` on `/diary`, and switches back to `Shinobu` after pressing
Home from `/anime-seasons`.
