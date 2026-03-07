import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/**
 * Compute SHA-256 hash of a file. This is the content address.
 */
export function hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

/**
 * Get blob storage path from hash: ab/cdef0123...
 */
export function blobPath(hash: string): string {
    return `${hash.slice(0, 2)}/${hash}`;
}
