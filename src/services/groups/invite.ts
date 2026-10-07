import { GroupType } from './types';

export interface InvitePayload {
  v: 1;
  groupId: string;
  name: string; // group name (max 40 chars)
  type: GroupType;
  currency: string;
  inviterName: string; // inviter display name (max 40 chars)
  groupKey: string; // 32 random bytes, base64url
}

const VALID_GROUP_TYPES: Set<GroupType> = new Set(['trip', 'event', 'household', 'other']);
const B64_URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const B64_LOOKUP = new Int8Array(256).fill(-1);
for (let i = 0; i < 64; i++) {
  B64_LOOKUP[B64_URL_CHARS.charCodeAt(i)] = i;
}
// Support standard base64 variants as well (+ and /)
B64_LOOKUP['+'.charCodeAt(0)] = 62;
B64_LOOKUP['/'.charCodeAt(0)] = 63;

/**
 * Encodes a Uint8Array to a base64url string (RFC 4648 without padding).
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let result = '';
  let i = 0;
  const len = bytes.length;

  for (; i + 2 < len; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result +=
      B64_URL_CHARS[(n >> 18) & 63] +
      B64_URL_CHARS[(n >> 12) & 63] +
      B64_URL_CHARS[(n >> 6) & 63] +
      B64_URL_CHARS[n & 63];
  }

  if (i < len) {
    if (len - i === 1) {
      const n = bytes[i] << 16;
      result += B64_URL_CHARS[(n >> 18) & 63] + B64_URL_CHARS[(n >> 12) & 63];
    } else if (len - i === 2) {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
      result +=
        B64_URL_CHARS[(n >> 18) & 63] +
        B64_URL_CHARS[(n >> 12) & 63] +
        B64_URL_CHARS[(n >> 6) & 63];
    }
  }

  return result;
}

/**
 * Decodes a base64 or base64url string to Uint8Array.
 */
export function base64UrlToBytes(str: string): Uint8Array {
  // Strip whitespace and padding
  const clean = str.replace(/[\s=]/g, '');
  const len = clean.length;
  if (len === 0) return new Uint8Array(0);

  // Calculate output byte length
  let validChars = 0;
  for (let i = 0; i < len; i++) {
    const code = clean.charCodeAt(i);
    if (code < 256 && B64_LOOKUP[code] !== -1) {
      validChars++;
    }
  }

  const byteLength = Math.floor((validChars * 6) / 8);
  const out = new Uint8Array(byteLength);

  let outIdx = 0;
  let buffer = 0;
  let bitsCollected = 0;

  for (let i = 0; i < len; i++) {
    const code = clean.charCodeAt(i);
    const val = code < 256 ? B64_LOOKUP[code] : -1;
    if (val === -1) continue;

    buffer = (buffer << 6) | val;
    bitsCollected += 6;

    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      out[outIdx++] = (buffer >> bitsCollected) & 0xff;
    }
  }

  return out.subarray(0, outIdx);
}

/**
 * Encodes an InvitePayload into a canonical finflow://join?d=<base64url> link.
 * Ensures strict character limits (max 40 for names, total link < 600 chars).
 */
export function encodeInviteLink(payload: InvitePayload): string {
  if (payload.v !== 1) {
    throw new Error('Unsupported invite payload version');
  }

  const name = payload.name.trim();
  if (!name || name.length > 40) {
    throw new Error(`Group name must be between 1 and 40 characters (got ${name.length})`);
  }

  const inviterName = payload.inviterName.trim();
  if (!inviterName || inviterName.length > 40) {
    throw new Error(`Inviter name must be between 1 and 40 characters (got ${inviterName.length})`);
  }

  if (!payload.groupId || payload.groupId.length > 100) {
    throw new Error('Invalid groupId in invite payload');
  }

  if (!VALID_GROUP_TYPES.has(payload.type)) {
    throw new Error(`Invalid group type: ${payload.type}`);
  }

  if (!payload.groupKey || payload.groupKey.length < 16) {
    throw new Error('Invalid groupKey in invite payload');
  }

  const normalized: InvitePayload = {
    v: 1,
    groupId: payload.groupId,
    name,
    type: payload.type,
    currency: payload.currency || '$',
    inviterName,
    groupKey: payload.groupKey,
  };

  const json = JSON.stringify(normalized);
  const bytes = new TextEncoder().encode(json);
  const b64url = bytesToBase64Url(bytes);
  const link = `finflow://join?d=${b64url}`;

  if (link.length >= 600) {
    throw new Error(`Invite link exceeds maximum allowed length of 600 characters (${link.length})`);
  }

  return link;
}

/**
 * Decodes and validates an invite link or raw 'd' parameter.
 * Rejects malformed input with descriptive errors.
 */
export function decodeInviteLink(input: string, fallbackCurrency = '$'): InvitePayload {
  if (!input || typeof input !== 'string') {
    throw new Error('Invite link input must be a non-empty string');
  }

  let encodedData = '';

  const trimmed = input.trim();
  if (trimmed.startsWith('finflow://join')) {
    const qIndex = trimmed.indexOf('?');
    if (qIndex === -1) {
      throw new Error('Missing query parameter in invite link');
    }
    const queryString = trimmed.slice(qIndex + 1);
    const params = new URLSearchParams(queryString);
    const d = params.get('d');
    if (!d) {
      throw new Error("Missing 'd' parameter in invite link");
    }
    encodedData = d;
  } else if (trimmed.startsWith('?d=') || trimmed.startsWith('d=')) {
    const queryString = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
    const params = new URLSearchParams(queryString);
    const d = params.get('d');
    if (!d) {
      throw new Error("Missing 'd' parameter in query string");
    }
    encodedData = d;
  } else {
    // Treat as raw base64url data
    encodedData = trimmed;
  }

  let jsonStr = '';
  try {
    const bytes = base64UrlToBytes(encodedData);
    jsonStr = new TextDecoder().decode(bytes);
  } catch (err) {
    throw new Error('Failed to decode base64url data in invite link');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error('Invalid JSON content inside invite payload');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invite payload must be an object');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.v !== 1) {
    throw new Error(`Unsupported invite version: ${String(obj.v)}`);
  }

  if (typeof obj.groupId !== 'string' || obj.groupId.trim().length === 0 || obj.groupId.length > 100) {
    throw new Error('Invalid groupId in invite payload');
  }

  if (typeof obj.name !== 'string' || obj.name.trim().length === 0 || obj.name.trim().length > 40) {
    throw new Error('Invalid group name (must be between 1 and 40 characters)');
  }

  if (typeof obj.type !== 'string' || !VALID_GROUP_TYPES.has(obj.type as GroupType)) {
    throw new Error(`Invalid group type: ${String(obj.type)}`);
  }

  if (typeof obj.inviterName !== 'string' || obj.inviterName.trim().length === 0 || obj.inviterName.trim().length > 40) {
    throw new Error('Invalid inviter name (must be between 1 and 40 characters)');
  }

  if (typeof obj.groupKey !== 'string' || obj.groupKey.length < 16 || obj.groupKey.length > 128) {
    throw new Error('Invalid group key in invite payload');
  }

  let currency = typeof obj.currency === 'string' && obj.currency.trim().length > 0 && obj.currency.length <= 10
    ? obj.currency.trim()
    : fallbackCurrency;

  return {
    v: 1,
    groupId: obj.groupId.trim(),
    name: obj.name.trim(),
    type: obj.type as GroupType,
    currency,
    inviterName: obj.inviterName.trim(),
    groupKey: obj.groupKey.trim(),
  };
}
