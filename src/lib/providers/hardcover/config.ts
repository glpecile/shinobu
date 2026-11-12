/**
 * Hardcover API constants (plan 0117). Free of RN/Expo imports, like
 * `simkl/config.ts`. Every endpoint answers a browser origin
 * (docs/solutions/web-cors-hardcover.md), so web and native share them.
 */

/** The API origin, and the `iss` every authorize redirect must carry (RFC 9207). */
export const HARDCOVER_ISSUER = 'https://api.hardcover.app';

export const HARDCOVER_AUTHORIZE_URL = 'https://hardcover.app/oauth2/authorize';
export const HARDCOVER_TOKEN_URL = `${HARDCOVER_ISSUER}/oauth2/token`;
export const HARDCOVER_REVOKE_URL = `${HARDCOVER_ISSUER}/oauth2/revoke`;
export const HARDCOVER_GRAPHQL_URL = `${HARDCOVER_ISSUER}/v1/graphql`;

/**
 * Exactly what the app registration allows. `read:me:content` and not
 * `read:me`, which also grants the member's email.
 */
export const HARDCOVER_SCOPES = [
  'read:me:content',
  'read:library',
  'write:library',
  'read:catalog:search',
  'read:journal',
] as const;

/** App-owned public client id. PKCE proves the client, so no secret exists. */
export function hardcoverClientId(): string {
  return process.env.EXPO_PUBLIC_HARDCOVER_CLIENT_ID ?? '';
}
