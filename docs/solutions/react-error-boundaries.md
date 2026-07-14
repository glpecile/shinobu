# React Error Boundaries

We use [`react-error-boundary`](https://www.npmjs.com/package/react-error-boundary)
to isolate render-time crashes so one component cannot bring down the whole app.

## Where the boundary lives

The root boundary wraps the entire app in `src/app/_layout.tsx` inside the
`QueryClientProvider`. Any render error in a route or component bubbles up to
`ErrorFallback`, which shows a minimal full-screen message and a retry action.

## What it catches (and does not catch)

Catches:
- Render errors in child components.
- Errors thrown during React lifecycle methods.

Does **not** catch:
- Event-handler errors (handle those with `try/catch` or `.catch()`).
- Asynchronous code errors (Promises, `setTimeout`, etc.).
- SSR errors on the server.

## Adding a nested boundary

For a feature that can fail independently (e.g. a provider connection widget),
wrap it in a local `ErrorBoundary` so the rest of the screen stays usable:

```tsx
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from '@/components/ErrorFallback';

<ErrorBoundary FallbackComponent={ErrorFallback}>
  <ProviderWidget />
</ErrorBoundary>
```

## Retry

`ErrorFallback` receives `resetErrorBoundary`. Tapping "Try again" resets the
boundary and re-renders the children. If the underlying error is transient,
this recovers the UI without an app restart.
