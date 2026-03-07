import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Generate a thumbnail for a photo.
 * Returns the relative path to the thumbnail within thumbDir.
 */
export async function generateThumb(
    sourcePath: string,
    hash: string,
    thumbDir: string,
    maxSize: number
): Promise<string> {
    const thumbRelative = `${hash.slice(0, 8)}.jpg`;
    const thumbPath = join(thumbDir, thumbRelative);

    await mkdir(dirname(thumbPath), { recursive: true });

    await sharp(sourcePath)
        .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);

    return thumbRelative;
}
