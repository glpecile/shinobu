# An optional `className` prop must default to `''`, not `undefined`

## Symptom

A wrapper component that forwards an optional `className` to a `withUniwind`
component crashes on web the moment a caller omits it:

```
styleq: tailwind typeof undefined is not "string" or "null".
```

The stack points at the JSX line, not at the prop.

## Cause

Uniwind compiles `className` into a styleq entry. styleq accepts a string or
`null`; `undefined` — what an omitted optional prop is — fails its type check.
The common React idiom (`className?: string`, forwarded as-is) is therefore
unsafe on any `withUniwind` component.

## Fix

Default the prop at the signature: `className = ''`.

`components/section-enter.tsx`. Any new wrapper that re-exposes `className`
does the same.
