# Padding passed to `Button` through `className` shrinks the label instead of widening the button

**Symptom (2026-07-27).** The Home zero-providers CTA rendered on a phone as a
squat crimson block with its label broken over **three** lines — "Connect / your
/ trackers" — surrounded by a wide margin of empty background. On a desktop
viewport the same button looked fine, which is why it survived review.

**The call site looked like it was making the button wider:**

```tsx
// components/empty-state-tile.tsx
<Button className={hero ? 'px-8 mt-8' : 'px-6 py-2.5 mt-5'} label={cta.label} … />
```

with a comment claiming `cn` inside `Button` would resolve the `px-*` collision
in favour of these.

**Cause.** It never collided, because the two paddings are on **different
elements**. `Button` keeps its drawn box on an inner `View` — a border on a
pressto pressable is never drawn on Android
(`pressto-border-not-drawn-on-android.md`) — and puts `className` on the outer
pressable that *wraps* that box:

```tsx
<PresstableOpacity className={cn('rounded-md', className)}>   {/* px-8 lands here */}
  <View className={cn('…', SIZE[size].container, …)}>        {/* px-5 lives here */}
```

So `px-8` doesn't widen the red box; it wraps it in 32px of invisible padding on
each side and takes that width away from everything inside. The paddings add
(32 + 20 = 52px a side) rather than one winning. Stacked with `EmptyFeed`'s own
`px-8` and `EmptyStateTile`'s `px-8`, a 390px viewport left the label ~126px to
lay out in — hence three lines. `tailwind-merge` semantics can't help: it only
dedupes conflicting classes *within one string*.

The same trap applies to `rounded-*`: a radius passed through `className`
reaches the pressable, while the visible box keeps its own.

**Fix.** `className` on `Button` is **layout only — margins, `self-*`, `flex`,
never padding or radius**, and that is now stated in the prop's doc comment.
Width comes from `self-stretch` (or the container); padding comes from `size`;
radius comes from the new `shape` prop, which is applied to the pressable and
the inner box alike:

```tsx
const SHAPE: Record<ButtonShape, string> = {
  rounded: 'rounded-md',
  pill: 'rounded-full',
};
```

```tsx
// empty-state-tile.tsx — margin only
<Button className={hero ? 'mt-8' : 'mt-5'} shape={hero ? 'pill' : 'rounded'} … />
```

**Generalisation.** Any wrapper that draws its box on an inner element has this
hazard: a spacing prop that reads like it targets the visible surface actually
targets the hit area. When a component splits "the thing you press" from "the
thing you see", say in the prop's docs which one `className` reaches — the call
site cannot tell from the outside, and the failure is silent and
viewport-dependent.
