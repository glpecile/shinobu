/**
 * Centralized route definitions. Use this instead of hardcoding path strings so
 * Expo Router route changes only require updates in one place.
 */
export const routes = {
  home: '/',
  connect: '/connect',
  search: '/search',
  details: (id: string) => `/details/${id}` as const,
} as const;
