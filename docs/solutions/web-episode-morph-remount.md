# Preserve the episode label across web steps

`MorphText` needs the same mounted instance to receive old and new values.
Replacing the dynamic episode route remounted the screen and made the code
snap instead of morphing. The loading branch could also remove the navigation
while the next episode's metadata loaded.

Web steps now use `router.setParams({ episode: [season, number] })`, as the
native pager already does. This changes the URL without adding a history entry.
Web keeps the floating navigation mounted across metadata loading. The shared
episode code uses MorphText on both platforms; native stepping still uses the
pager's EpisodeStep context.

Browser verification checks that the pill DOM node survives an episode step,
the code changes, and history length stays unchanged. Arrow keys and the
disabled end of the sequence still work.
