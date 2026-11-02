# react-native-web silently drops `textAlign` and the native a11y-hiding props

**Symptom (2026-11-02, PR #408).** The manga "Through chapter" field passed
`textAlign="center"` to `TextField` and rendered centred on iOS and Android but
left-aligned on web. Its decorative hint icon carried
`accessibilityElementsHidden` and `importantForAccessibility="no"`, and on web
its private-use glyph still reached screen readers.

**Why.** react-native-web 0.21's `TextInput` and `Text` forward only a fixed
prop list (`pick(props, forwardPropsList)` in
`react-native-web/dist/exports/TextInput/index.js` and `exports/Text/index.js`).
`textAlign` is a TextInput prop on native but not on that list, and neither
native hiding prop is either. Nothing warns: the props just vanish.

**Fix.**

- Alignment: `TextField` adds the matching class (`text-center`) next to the
  prop, so the style reaches the DOM.
- Hiding: pass `aria-hidden` as well. RNW maps it to the DOM attribute, and RN's
  own `Text`/`View` translate it to `accessibilityElementsHidden` and
  `importantForAccessibility="no-hide-descendants"`, so it covers native too
  (`components/toast-card.tsx` already does this).

**Rule of thumb.** A native-only prop that changes what the user sees or hears
needs a web counterpart that RNW forwards: a class, a `style` key or an `aria-*`
prop. Check the component's `forwardPropsList` before trusting one.
