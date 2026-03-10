import {mkdir, copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {createBundleManifest, FOTOS_BUNDLE_MANIFEST} from './bundle.js';
import type {Catalog, ExifData} from './types.js';
import {blobPath} from './hash.js';
import {filterPhotos, loadCatalog, loadConfig} from './catalog.js';
import {generateViewer} from './viewer.js';

/**
 * Export a self-contained photo collection to a target directory.
 * Copies viewer + thumbnails + optionally full photos.
 */
export async function exportCollection(
    sourceDir: string,
    targetDir: string,
    options: {tag?: string; includeOriginals?: boolean}
): Promise<{exported: number}> {
    const catalog = await loadCatalog(sourceDir);
    const config = await loadConfig(sourceDir);
    const entries = await filterPhotos(catalog, options.tag);

    if (entries.length === 0) {
        throw new Error(
            options.tag
                ? `No entries with tag: ${options.tag}`
                : 'Catalog is empty'
        );
    }

    // Create target dirs
    const thumbTarget = join(targetDir, config.thumbDir);
    const blobTarget = join(targetDir, config.blobDir);
    await mkdir(thumbTarget, {recursive: true});
    if (options.includeOriginals) {
        await mkdir(blobTarget, {recursive: true});
    }

    // Copy thumbnails
    for (const entry of entries) {
        if (entry.thumb) {
            const src = join(sourceDir, config.thumbDir, entry.thumb);
            const dest = join(thumbTarget, entry.thumb);
            await copyFile(src, dest).catch(() => {
                // Thumb may not exist for reference-only entries
            });
        }
    }

    // Copy originals if requested
    if (options.includeOriginals) {
        for (const entry of entries) {
            if (entry.managed === 'ingested') {
                const bp = blobPath(entry.stream.id);
                const src = join(sourceDir, config.blobDir, bp);
                const destDir = join(blobTarget, entry.stream.id.slice(0, 2));
                await mkdir(destDir, {recursive: true});
                await copyFile(src, join(blobTarget, bp));
            }
        }
    }

    // Build export catalog (v1 format for viewer)
    const exportCatalog: Catalog = {
        version: 1,
        name: options.tag
            ? `${catalog.name} — ${options.tag}`
            : catalog.name,
        created: catalog.created,
        device: catalog.device,
        photos: entries.map(e => ({
            ...e,
            exif: e.stream.exif as ExifData | undefined,
            // Strip source paths in export
            sourcePath: undefined,
            // Mark as ingested only if originals included
            managed: options.includeOriginals && e.managed === 'ingested'
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

    await writeFile(
        join(targetDir, FOTOS_BUNDLE_MANIFEST),
        JSON.stringify(
            createBundleManifest(config, !!options.includeOriginals),
            null,
            2
        ) + '\n'
    );

    return {exported: entries.length};
}
