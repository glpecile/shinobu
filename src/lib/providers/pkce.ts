import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';

/**
 * 64 chars of the RFC 7636 "unreserved" set, deliberately sized at exactly 64
 * so `byte & 0x3f` indexes it without modulo bias.
 */
const VERIFIER_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** RFC 7636 allows 43-128; 64 gives 384 bits of entropy. */
const VERIFIER_LENGTH = 64;

/** A random string for a PKCE verifier or an OAuth `state`. */
export function randomUnreserved(length: number): string {
  const bytes = getRandomBytes(length);
  let out = '';
  for (const byte of bytes) {
    out += VERIFIER_ALPHABET[byte & 0x3f];
  }
  return out;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** S256: challenge = base64url(sha256(ascii(verifier))). */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const base64 = await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: CryptoEncoding.BASE64,
  });
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomUnreserved(VERIFIER_LENGTH);
  return { verifier, challenge: await deriveCodeChallenge(verifier) };
}
