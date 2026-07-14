# uniwind `className` is a silent no-op on third-party components (native only)

## Symptom

Poster images rendered fine on web but were completely invisible on iOS —
cards showed their border, gradient, and title overlay, but no image. No
warning, no error, nothing in the logs.

## Cause

Uniwind resolves `className` natively only for React Native core components
(and anything wrapped in `withUniwind`). On a third-party component like
`expo-image`'s `Image`, the prop is silently dropped on iOS/Android — so
`className="w-full h-full"` produced an unstyled image with no intrinsic
size, i.e. 0×0.

It *appears* to work on web, which is what makes this a trap: react-native-web
renders the component to a DOM element, the unknown `className` prop passes
through to the DOM, and uniwind's generated CSS (real CSS on web) matches it.
The web build masks the native bug entirely.

## Fix

Wrap the component once with uniwind's `withUniwind` HOC and import the
wrapper everywhere:

```tsx
// src/components/image.tsx
import { Image as ExpoImage } from 'expo-image';
import { withUniwind } from 'uniwind';

export const Image = withUniwind(ExpoImage);
```

`withUniwind` maps `className` → `style` (and `fooStyle` → `fooClassName`,
`color` props → `colorClassName`) on native, and is a pass-through on web.

Direct `expo-image` imports are now banned by `no-restricted-imports` in
`.oxlintrc.json` (with an override for the wrapper file itself).

## Rule of thumb

Any third-party component receiving `className` needs a `withUniwind` wrapper.
If a style "works on web but not on native", check for this first — inline
`style={{...}}` props working while `className` doesn't (e.g. the
`LinearGradient` in the same card rendered fine) is the fingerprint.
