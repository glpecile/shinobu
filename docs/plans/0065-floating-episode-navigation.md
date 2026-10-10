# Floating episode navigation

- Replace the full-width Previous, Next, and View series footer with one floating
  rounded surface on web and native.
- An episode pill: previous and next arrows flank a larger morphing episode code.
  A separate circular series button has a View series tooltip on web hover/focus
  and an accessible label on every platform.
- Flatten the controls into a single compact surface; no nested button outlines.
  Center it on native and anchor it bottom-right on web. Morph the episode code.
- Reuse Button and the existing episode-step context; preserve disabled ends,
  native paging, web keyboard shortcuts, and guarded series navigation.
- Native mounts one panel outside the pager's pages, inside its step context.
- Web steps with setParams, preserving the mounted morph label and replacing
  the current history entry rather than remounting the screen for each episode.
- Respect the bottom safe area and reserve scroll clearance beneath content.
- Use theme tokens for both modes; no dependencies or native rebuild.
