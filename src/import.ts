import {copyFile, mkdir, readFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import type {Stream} from '@refinio/chat.media';
import {loadCatalog, loadConfig, saveCatalog} from './catalog.js';
import {FOTOS_BUNDLE_MANIFEST} from './bundle.js';
import {blobPath} from './hash.js';
import type {Catalog, FotosConfig, FotosEntry} from './types.js';
import {DEFAULT_CONFIG} from './types.js';

async function readBundleCatalog(sourceDir: string): Promise<Catalog> {
    const raw = await readFile(join(sourceDir, 'catalog.json'), 'utf-8');
    const parsed = JSON.parse(raw) as Catalog;

    if (parsed.version !== 1 || !Array.isArray(parsed.photos)) {
        throw new Error('Unsupported bundle catalog format');
    }

    return parsed;
}

async function readBundleRoots(sourceDir: string): Promise<{
    thumbDir: string;
    blobDir: string;
}> {
    try {
        const raw = await readFile(join(sourceDir, FOTOS_BUNDLE_MANIFEST), 'utf-8');
        const parsed = JSON.parse(raw) as {
            thumbDir?: string;
            blobDir?: string;
        };
        return {
            thumbDir: parsed.thumbDir ?? DEFAULT_CONFIG.thumbDir,
            blobDir: parsed.blobDir ?? DEFAULT_CONFIG.blobDir,
        };
    } catch {
        return {
            thumbDir: DEFAULT_CONFIG.thumbDir,
            blobDir: DEFAULT_CONFIG.blobDir,
        };
    }
}

async function copyRelativeFile(
    sourceRoot: string,
    targetRoot: string,
    relativePath: string
): Promise<boolean> {
    const source = join(sourceRoot, relativePath);
    const target = join(targetRoot, relativePath);

    try {
        await mkdir(dirname(target), {recursive: true});
        await copyFile(source, target);
        return true;
    } catch {
        return false;
    }
}

function normalizeImportedEntry(
    photo: Catalog['photos'][number],
    deviceName: string
): FotosEntry {
    const copies = new Set(photo.copies ?? []);
    copies.add(deviceName);

    const stream: Stream = {
        ...(photo.stream as Stream),
        exif: photo.exif
            ? photo.exif as Record<string, unknown>
            : photo.stream.exif as Record<string, unknown> | undefined,
    };

    return {
        stream,
        name: photo.name,
        managed: photo.managed === 'ingested' ? 'ingested' : 'metadata',
        thumb: photo.thumb,
        tags: [...photo.tags],
        size: photo.size,
        copies: [...copies],
    };
}

export interface ImportBundleResult {
    imported: number;
    skipped: number;
    copiedThumbs: number;
    copiedOriginals: number;
}

export async function importCollectionBundle(
    targetDir: string,
    sourceDir: string
): Promise<ImportBundleResult> {
    const [catalog, config, bundle, bundleRoots] = await Promise.all([
        loadCatalog(targetDir),
        loadConfig(targetDir),
        readBundleCatalog(sourceDir),
        readBundleRoots(sourceDir),
    ]);

    if (catalog.trie.entryCount() === 0 && bundle.name) {
        catalog.name = bundle.name;
    }

    let imported = 0;
    let skipped = 0;
    let copiedThumbs = 0;
    let copiedOriginals = 0;

    for (const photo of bundle.photos) {
        if (!photo.stream?.id) {
            throw new Error(`Bundle photo is missing stream identity: ${photo.name}`);
        }

        if (catalog.trie.getEntry(photo.stream.id)) {
            skipped++;
            continue;
        }

        const entry = normalizeImportedEntry(photo, config.deviceName);

        if (entry.thumb) {
            const copied = await copyRelativeFile(
                join(sourceDir, bundleRoots.thumbDir),
                join(targetDir, config.thumbDir),
                entry.thumb
            );
            if (copied) {
                copiedThumbs++;
            } else {
                entry.thumb = undefined;
            }
        }

        if (entry.managed === 'ingested') {
            const relativeBlob = blobPath(entry.stream.id);
            const copied = await copyRelativeFile(
                join(sourceDir, bundleRoots.blobDir),
                join(targetDir, config.blobDir),
                relativeBlob
            );
            if (copied) {
                copiedOriginals++;
            } else {
                entry.managed = 'metadata';
            }
        }

        await catalog.trie.insert(entry);
        imported++;
    }

    await saveCatalog(targetDir, catalog);

    return {
        imported,
        skipped,
        copiedThumbs,
        copiedOriginals,
    };
}
