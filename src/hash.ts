import {createCryptoHash} from '@refinio/one.core/lib/system/crypto-helpers.js';
import {readFile} from 'node:fs/promises';

/**
 * Compute SHA-256 hash of a file's image data (excluding metadata).
 *
 * For JPEG files, strips APPn (EXIF, XMP, JFIF) and COM segments so the
 * hash is stable across metadata edits and re-exports.
 * For other formats, hashes the full file.
 */
export async function hashFile(filePath: string): Promise<string> {
    const buffer = await readFile(filePath);
    const data = isJpeg(buffer) ? stripJpegMetadata(buffer) : buffer;
    return createCryptoHash(data.toString('hex'));
}

/**
 * Check if buffer starts with JPEG SOI marker (FF D8).
 */
function isJpeg(buf: Buffer): boolean {
    return buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
}

/**
 * Strip metadata segments from JPEG, keeping only image data.
 *
 * Removes APPn (FF E0–EF) and COM (FF FE) segments.
 * Keeps SOI, DQT, DHT, SOF, SOS, and entropy-coded data.
 */
function stripJpegMetadata(buf: Buffer): Buffer {
    const chunks: Buffer[] = [];
    // Keep SOI
    chunks.push(buf.subarray(0, 2));

    let pos = 2;
    while (pos < buf.length - 1) {
        if (buf[pos] !== 0xff) break;

        const marker = buf[pos + 1];

        // EOI
        if (marker === 0xd9) {
            chunks.push(buf.subarray(pos, pos + 2));
            break;
        }

        // SOS (FF DA): push marker + header, then all remaining data until EOI
        if (marker === 0xda) {
            chunks.push(buf.subarray(pos));
            break;
        }

        // Markers without length (standalone): RST0–RST7, TEM
        if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
            chunks.push(buf.subarray(pos, pos + 2));
            pos += 2;
            continue;
        }

        // Segment with length
        if (pos + 3 >= buf.length) break;
        const segLen = buf.readUInt16BE(pos + 2);

        // Skip APPn (E0–EF) and COM (FE) — these are metadata
        if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
            pos += 2 + segLen;
            continue;
        }

        // Keep everything else (DQT, DHT, SOF, etc.)
        chunks.push(buf.subarray(pos, pos + 2 + segLen));
        pos += 2 + segLen;
    }

    return Buffer.concat(chunks);
}

/**
 * SHA-256 hash of a string. Used by trie operations.
 */
export async function hashString(data: string): Promise<string> {
    return createCryptoHash(data);
}

/**
 * Derive a stable creator hash from owner name.
 * Deterministic: same owner name = same creator identity.
 * Compatible with SHA256IdHash<Person> when joining ONE.core network later.
 */
export async function ownerToCreator(owner: string): Promise<string> {
    return createCryptoHash(owner);
}

/**
 * Compute deterministic Stream ID from available context.
 *
 * Priority:
 * 1. EXIF date + creator + mimeType (rich metadata — "photo taken by X at time Y")
 * 2. creator + created + mimeType (recording context — "recorded by X at time Y")
 * 3. contentHash (content-addressed fallback — "we know what it is")
 */
export async function computeStreamId(context: {
    creator?: string;
    created?: number;
    mimeType: string;
    contentHash?: string;
    exifDate?: string;
}): Promise<string> {
    if (context.creator && context.exifDate) {
        return createCryptoHash(`${context.creator}:${context.exifDate}:${context.mimeType}`);
    }
    if (context.creator && context.created) {
        return createCryptoHash(`${context.creator}:${context.created}:${context.mimeType}`);
    }
    if (context.contentHash) {
        return context.contentHash;
    }
    throw new Error('Cannot compute stream identity: no metadata or content hash');
}

/**
 * Detect MIME type from file extension.
 */
export function mimeFromPath(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop();
    switch (ext) {
        case 'jpg': case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        case 'heic': case 'heif': return 'image/heic';
        case 'tiff': case 'tif': return 'image/tiff';
        case 'avif': return 'image/avif';
        case 'mp4': return 'video/mp4';
        case 'mov': return 'video/quicktime';
        case 'avi': return 'video/x-msvideo';
        default: return 'application/octet-stream';
    }
}

/**
 * Get blob storage path from hash: ab/cdef0123...
 */
export function blobPath(hash: string): string {
    return `${hash.slice(0, 2)}/${hash}`;
}
