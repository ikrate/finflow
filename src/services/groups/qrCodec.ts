import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { GroupEvent, VersionVector } from './types';
import { generateUUID } from './uuid';

// Precomputed CRC32 table
const CRC_TABLE = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c;
}

export function computeCRC32(bytes: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

export type QRBundle =
  | { v: 1; type: 'summary'; groupId: string; vector: VersionVector; name: string }
  | { v: 1; type: 'delta'; groupId: string; events: GroupEvent[]; vector: VersionVector }
  | { v: 1; type: 'invite'; groupId: string; snapshotEvents: GroupEvent[] };

export const FRAME_PREFIX = 'FF1';
export const CHUNK_SIZE = 700;
export const MAX_RECOMMENDED_FRAMES = 150;

/**
 * Encodes Uint8Array to base64url string without padding.
 */
export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  const len = bytes.length;

  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    const n = (b0 << 16) | (b1 << 8) | b2;

    result += chars[(n >> 18) & 63];
    result += chars[(n >> 12) & 63];
    if (i + 1 < len) {
      result += chars[(n >> 6) & 63];
    }
    if (i + 2 < len) {
      result += chars[n & 63];
    }
  }

  return result;
}

/**
 * Decodes base64url string to Uint8Array.
 */
export function base64UrlToUint8Array(str: string): Uint8Array {
  const lookup: Record<string, number> = {};
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  for (let i = 0; i < chars.length; i++) {
    lookup[chars[i]] = i;
  }

  // Handle standard base64 variants if present
  lookup['+'] = 62;
  lookup['/'] = 63;

  const clean = str.replace(/=/g, '');
  const len = clean.length;
  const byteLen = Math.floor((len * 3) / 4);
  const bytes = new Uint8Array(byteLen);

  let byteIdx = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = lookup[clean[i]];
    const c1 = lookup[clean[i + 1]];
    const c2 = i + 2 < len ? lookup[clean[i + 2]] : 0;
    const c3 = i + 3 < len ? lookup[clean[i + 3]] : 0;

    if (c0 === undefined || c1 === undefined) {
      throw new Error('Invalid base64 character');
    }

    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;

    if (byteIdx < byteLen) bytes[byteIdx++] = (n >> 16) & 255;
    if (i + 2 < len && byteIdx < byteLen) bytes[byteIdx++] = (n >> 8) & 255;
    if (i + 3 < len && byteIdx < byteLen) bytes[byteIdx++] = n & 255;
  }

  return bytes;
}

export interface EncodedQRBundle {
  bundleId: string;
  frames: string[];
  totalFrames: number;
  crc32Hex: string;
  isLargeBundle: boolean;
}

/**
 * Compresses and encodes a QRBundle into an array of FF1 chunked frames.
 */
export function encodeQRBundle(bundle: QRBundle, chunkSize = CHUNK_SIZE): EncodedQRBundle {
  const bundleId = generateUUID().slice(0, 8); // compact 8-char id
  const jsonStr = JSON.stringify(bundle);
  const u8 = strToU8(jsonStr);

  // Deflate compression
  const compressed = deflateSync(u8, { level: 6 });
  const checksum = (computeCRC32(compressed) >>> 0).toString(16).padStart(8, '0');
  const base64Payload = uint8ArrayToBase64Url(compressed);

  const totalFrames = Math.max(1, Math.ceil(base64Payload.length / chunkSize));
  const frames: string[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const chunk = base64Payload.slice(i * chunkSize, (i + 1) * chunkSize);
    // Frame format: FF1|<bundleId>|<index 1-based>|<total>|<crc32Hex>|<chunk>
    frames.push(`${FRAME_PREFIX}|${bundleId}|${i + 1}|${totalFrames}|${checksum}|${chunk}`);
  }

  return {
    bundleId,
    frames,
    totalFrames,
    crc32Hex: checksum,
    isLargeBundle: totalFrames > MAX_RECOMMENDED_FRAMES,
  };
}

export interface ParsedFrame {
  valid: boolean;
  bundleId?: string;
  index?: number; // 1-based
  total?: number;
  crc32Hex?: string;
  chunk?: string;
  error?: string;
}

/**
 * Parses an individual scanned QR frame.
 */
export function parseQRFrame(rawText: string): ParsedFrame {
  if (!rawText || !rawText.startsWith(`${FRAME_PREFIX}|`)) {
    return { valid: false, error: 'Not a FinFlow QR code' };
  }

  const parts = rawText.split('|');
  if (parts.length < 6) {
    return { valid: false, error: 'Malformed frame structure' };
  }

  const [, bundleId, idxStr, totalStr, crc32Hex, ...chunkParts] = parts;
  const chunk = chunkParts.join('|'); // in case chunk contained |

  const index = parseInt(idxStr, 10);
  const total = parseInt(totalStr, 10);

  if (isNaN(index) || isNaN(total) || index < 1 || index > total) {
    return { valid: false, error: 'Invalid frame index or total' };
  }

  if (!bundleId || !crc32Hex) {
    return { valid: false, error: 'Missing bundle ID or checksum' };
  }

  return {
    valid: true,
    bundleId,
    index,
    total,
    crc32Hex,
    chunk,
  };
}

export interface AssemblerStatus {
  status: 'progress' | 'complete' | 'different_bundle' | 'error';
  bundleId?: string;
  receivedCount: number;
  totalCount: number;
  bundle?: QRBundle;
  error?: string;
}

/**
 * Frame assembler to accumulate scanned QR frames in any order.
 */
export class QRFrameAssembler {
  private currentBundleId: string | null = null;
  private totalCount = 0;
  private expectedCrc32Hex = '';
  private chunksMap = new Map<number, string>();

  public reset(): void {
    this.currentBundleId = null;
    this.totalCount = 0;
    this.expectedCrc32Hex = '';
    this.chunksMap.clear();
  }

  public getProgress(): { received: number; total: number; percent: number } {
    const received = this.chunksMap.size;
    const total = this.totalCount;
    const percent = total > 0 ? Math.round((received / total) * 100) : 0;
    return { received, total, percent };
  }

  public addFrame(rawText: string): AssemblerStatus {
    const parsed = parseQRFrame(rawText);
    if (!parsed.valid || !parsed.bundleId || !parsed.index || !parsed.total || !parsed.crc32Hex) {
      return {
        status: 'error',
        receivedCount: this.chunksMap.size,
        totalCount: this.totalCount,
        error: parsed.error || 'Invalid frame',
      };
    }

    // Check bundle id
    if (this.currentBundleId !== null && this.currentBundleId !== parsed.bundleId) {
      return {
        status: 'different_bundle',
        bundleId: parsed.bundleId,
        receivedCount: this.chunksMap.size,
        totalCount: this.totalCount,
        error: `Scanned code belongs to a different transfer (id: ${parsed.bundleId})`,
      };
    }

    if (this.currentBundleId === null) {
      this.currentBundleId = parsed.bundleId;
      this.totalCount = parsed.total;
      this.expectedCrc32Hex = parsed.crc32Hex;
    }

    // Save chunk
    this.chunksMap.set(parsed.index, parsed.chunk || '');

    // Check completion
    if (this.chunksMap.size === this.totalCount) {
      try {
        let fullBase64 = '';
        for (let i = 1; i <= this.totalCount; i++) {
          const c = this.chunksMap.get(i);
          if (c === undefined) {
            return {
              status: 'error',
              receivedCount: this.chunksMap.size,
              totalCount: this.totalCount,
              error: `Missing frame ${i}`,
            };
          }
          fullBase64 += c;
        }

        const compressedBytes = base64UrlToUint8Array(fullBase64);
        const actualChecksum = (computeCRC32(compressedBytes) >>> 0).toString(16).padStart(8, '0');

        if (actualChecksum.toLowerCase() !== this.expectedCrc32Hex.toLowerCase()) {
          return {
            status: 'error',
            receivedCount: this.chunksMap.size,
            totalCount: this.totalCount,
            error: 'Corrupted payload (checksum mismatch)',
          };
        }

        const decompressed = inflateSync(compressedBytes);
        const jsonStr = strFromU8(decompressed);
        const bundle = JSON.parse(jsonStr) as QRBundle;

        return {
          status: 'complete',
          bundleId: this.currentBundleId,
          receivedCount: this.totalCount,
          totalCount: this.totalCount,
          bundle,
        };
      } catch (err) {
        return {
          status: 'error',
          receivedCount: this.chunksMap.size,
          totalCount: this.totalCount,
          error: `Decompression failed: ${(err as Error).message}`,
        };
      }
    }

    return {
      status: 'progress',
      bundleId: this.currentBundleId,
      receivedCount: this.chunksMap.size,
      totalCount: this.totalCount,
    };
  }
}
