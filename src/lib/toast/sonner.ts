/**
 * The library binding — the only platform split in the toast stack. Native
 * renders through sonner-native; the `.web.ts` sibling re-exports web sonner,
 * which shares the same `toast.success(title, { description, duration })`
 * call shape, so `index.ts` stays one implementation for all four targets.
 */
export { toast as sonnerToast } from 'sonner-native';
