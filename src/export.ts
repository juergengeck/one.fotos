import { mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { Catalog, PhotoEntry, FotosConfig } from './types.js';
import { blobPath } from './hash.js';
import { filterPhotos, loadCatalog, loadConfig } from './catalog.js';
import { generateViewer } from './viewer.js';

/**
 * Export a self-contained photo collection to a target directory.
 * Copies viewer + thumbnails + optionally full photos.
 */
export async function exportCollection(
    sourceDir: string,
    targetDir: string,
    options: { tag?: string; includeOriginals?: boolean }
): Promise<{ exported: number }> {
    const catalog = await loadCatalog(sourceDir);
    const config = await loadConfig(sourceDir);
    const photos = filterPhotos(catalog, options.tag);

    if (photos.length === 0) {
        throw new Error(
            options.tag
                ? `No photos with tag: ${options.tag}`
                : 'Catalog is empty'
        );
    }

    // Create target dirs
    const thumbTarget = join(targetDir, config.thumbDir);
    const blobTarget = join(targetDir, config.blobDir);
    await mkdir(thumbTarget, { recursive: true });
    if (options.includeOriginals) {
        await mkdir(blobTarget, { recursive: true });
    }

    // Copy thumbnails
    for (const photo of photos) {
        if (photo.thumb) {
            const src = join(sourceDir, config.thumbDir, photo.thumb);
            const dest = join(thumbTarget, photo.thumb);
            await copyFile(src, dest).catch(() => {
                // Thumb may not exist for reference-only entries
            });
        }
    }

    // Copy originals if requested
    if (options.includeOriginals) {
        for (const photo of photos) {
            if (photo.managed === 'ingested') {
                const bp = blobPath(photo.hash);
                const src = join(sourceDir, config.blobDir, bp);
                const destDir = join(blobTarget, photo.hash.slice(0, 2));
                await mkdir(destDir, { recursive: true });
                await copyFile(src, join(blobTarget, bp));
            }
        }
    }

    // Build export catalog and viewer
    const exportCatalog: Catalog = {
        ...catalog,
        name: options.tag
            ? `${catalog.name} — ${options.tag}`
            : catalog.name,
        photos: photos.map(p => ({
            ...p,
            // Strip source paths in export
            sourcePath: undefined,
            // Mark as ingested only if originals included
            managed: options.includeOriginals && p.managed === 'ingested'
                ? 'ingested' as const
                : 'metadata' as const
        }))
    };

    await writeFile(
        join(targetDir, 'catalog.json'),
        JSON.stringify(exportCatalog, null, 2) + '\n'
    );

    await writeFile(
        join(targetDir, 'index.html'),
        generateViewer(exportCatalog)
    );

    return { exported: photos.length };
}
