import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64UrlToBytes, bytesToBase64Url } from '../invite';

export interface HandshakeContext {
  v: 1;
  nonce: string;
  proof: string;
  deviceId?: string;
}

/**
 * Converts a Uint8Array to a lowercase hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Constant-time comparison of two Uint8Arrays to prevent timing attacks.
 */
export function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Generates cryptographically strong random bytes.
 */
export function generateRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

/**
 * Generates a 32-byte group key encoded as base64url.
 */
export function generateGroupKey(): string {
  const bytes = generateRandomBytes(32);
  return bytesToBase64Url(bytes);
}

/**
 * Generates a 16-byte nonce encoded as base64url.
 */
export function generateNonce(): string {
  const bytes = generateRandomBytes(16);
  return bytesToBase64Url(bytes);
}

/**
 * Computes the 8-hex-character discovery hash for discoveryInfo: { g: <hash> }
 * Never broadcasts the groupKey or the full groupId.
 */
export function computeGroupHash(groupId: string): string {
  const bytes = new TextEncoder().encode(groupId);
  const hash = sha256(bytes);
  return bytesToHex(hash).slice(0, 8);
}

/**
 * Computes HMAC-SHA256 proof: HMAC-SHA256(groupKey, nonce + groupId) as base64url.
 */
export function computeHandshakeProof(groupKey: string, nonce: string, groupId: string): string {
  const keyBytes = base64UrlToBytes(groupKey);
  const messageBytes = new TextEncoder().encode(nonce + groupId);
  const mac = hmac(sha256, keyBytes, messageBytes);
  return bytesToBase64Url(mac);
}

/**
 * Creates the JSON context payload string sent during Multipeer invitation.
 */
export function createHandshakeContext(groupKey: string, groupId: string, deviceId?: string): string {
  const nonce = generateNonce();
  const proof = computeHandshakeProof(groupKey, nonce, groupId);
  const context: HandshakeContext = {
    v: 1,
    nonce,
    proof,
    ...(deviceId ? { deviceId } : {}),
  };
  return JSON.stringify(context);
}

export interface VerificationResult {
  valid: boolean;
  isMalformed?: boolean;
  deviceId?: string;
}

/**
 * Verifies an incoming handshake context against local groupKey and groupId.
 * Rejects silently on malformed context.
 */
export function verifyHandshakeContext(
  contextStr: string | null | undefined,
  groupKey: string | null | undefined,
  groupId: string
): VerificationResult {
  if (!contextStr || typeof contextStr !== 'string') {
    return { valid: false, isMalformed: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contextStr);
  } catch {
    return { valid: false, isMalformed: true };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, isMalformed: true };
  }

  const ctx = parsed as Record<string, unknown>;
  if (ctx.v !== 1 || typeof ctx.nonce !== 'string' || typeof ctx.proof !== 'string') {
    return { valid: false, isMalformed: true };
  }

  const deviceId = typeof ctx.deviceId === 'string' ? ctx.deviceId : undefined;

  if (!groupKey || typeof groupKey !== 'string') {
    return { valid: false, isMalformed: false, deviceId };
  }

  try {
    const keyBytes = base64UrlToBytes(groupKey);
    const messageBytes = new TextEncoder().encode(ctx.nonce + groupId);
    const expectedMac = hmac(sha256, keyBytes, messageBytes);
    const actualMac = base64UrlToBytes(ctx.proof);

    const match = constantTimeCompare(expectedMac, actualMac);
    return { valid: match, isMalformed: false, deviceId };
  } catch {
    return { valid: false, isMalformed: true };
  }
}
