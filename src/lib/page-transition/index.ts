import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Native stacks animate their own pushes, so there is nothing to add here.
 * Web (`index.web.ts`) returns the blur-fade a freshly mounted page plays.
 */
export function usePageEnterStyle(): StyleProp<ViewStyle> {
  return undefined;
}
