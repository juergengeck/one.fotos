import { readFile, writeFile, stat, copyFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { Catalog, PhotoEntry, FotosConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { hashFile, blobPath } from './hash.js';
import { extractExif } from './exif.js';
import { generateThumb } from './thumbs.js';

const CATALOG_FILE = 'catalog.json';
const CONFIG_FILE = 'fotos.json';

/**
 * Load catalog from working directory, or create empty one.
 */
export async function loadCatalog(dir: string): Promise<Catalog> {
    const path = join(dir, CATALOG_FILE);
    try {
        const raw = await readFile(path, 'utf-8');
        return JSON.parse(raw) as Catalog;
    } catch {
        return {
            version: 1,
            name: basename(dir),
            created: new Date().toISOString(),
            photos: []
        };
    }
}

export async function saveCatalog(
    dir: string,
    catalog: Catalog
): Promise<void> {
    const path = join(dir, CATALOG_FILE);
    await writeFile(path, JSON.stringify(catalog, null, 2) + '\n');
}

export async function loadConfig(dir: string): Promise<FotosConfig> {
    const path = join(dir, CONFIG_FILE);
    try {
        const raw = await readFile(path, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_CONFIG };
    }
}

export async function saveConfig(
    dir: string,
    config: FotosConfig
): Promise<void> {
    const path = join(dir, CONFIG_FILE);
    await writeFile(path, JSON.stringify(config, null, 2) + '\n');
}

export type AddMode = 'reference' | 'metadata' | 'ingest';

/**
 * Add a photo to the catalog.
 */
export async function addPhoto(
    dir: string,
    filePath: string,
    mode: AddMode
): Promise<PhotoEntry> {
    const config = await loadConfig(dir);
    const catalog = await loadCatalog(dir);

    const hash = await hashFile(filePath);

    // Check for duplicate
    const existing = catalog.photos.find(p => p.hash === hash);
    if (existing) {
        throw new Error(
            `Photo already in catalog: ${existing.name} (${hash.slice(0, 8)})`
        );
    }

    const fileStat = await stat(filePath);

    const entry: PhotoEntry = {
        hash,
        name: basename(filePath),
        managed: mode === 'ingest' ? 'ingested' : mode,
        tags: [],
        addedAt: new Date().toISOString(),
        size: fileStat.size,
        copies: [config.deviceName]
    };

    // Reference mode: just store the source path
    if (mode === 'reference') {
        entry.sourcePath = filePath;
    }

    // Metadata mode: extract EXIF + generate thumbnail
    if (mode === 'metadata' || mode === 'ingest') {
        entry.sourcePath = mode === 'metadata' ? filePath : undefined;
        entry.exif = await extractExif(filePath);

        const thumbDir = join(dir, config.thumbDir);
        entry.thumb = await generateThumb(
            filePath,
            hash,
            thumbDir,
            config.thumbSize
        );
    }

    // Ingest mode: copy to blob store
    if (mode === 'ingest') {
        const blobDir = join(dir, config.blobDir);
        const dest = join(blobDir, blobPath(hash));
        await mkdir(join(blobDir, hash.slice(0, 2)), { recursive: true });
        await copyFile(filePath, dest);
    }

    catalog.photos.push(entry);
    await saveCatalog(dir, catalog);

    return entry;
}

/**
 * Tag photos by hash prefix.
 */
export async function tagPhotos(
    dir: string,
    hashPrefix: string,
    tags: string[]
): Promise<PhotoEntry[]> {
    const catalog = await loadCatalog(dir);
    const matches = catalog.photos.filter(p =>
        p.hash.startsWith(hashPrefix)
    );

    if (matches.length === 0) {
        throw new Error(`No photos matching prefix: ${hashPrefix}`);
    }

    for (const photo of matches) {
        for (const tag of tags) {
            if (!photo.tags.includes(tag)) {
                photo.tags.push(tag);
            }
        }
    }

    await saveCatalog(dir, catalog);
    return matches;
}

/**
 * Remove tags from photos.
 */
export async function untagPhotos(
    dir: string,
    hashPrefix: string,
    tags: string[]
): Promise<PhotoEntry[]> {
    const catalog = await loadCatalog(dir);
    const matches = catalog.photos.filter(p =>
        p.hash.startsWith(hashPrefix)
    );

    if (matches.length === 0) {
        throw new Error(`No photos matching prefix: ${hashPrefix}`);
    }

    for (const photo of matches) {
        photo.tags = photo.tags.filter(t => !tags.includes(t));
    }

    await saveCatalog(dir, catalog);
    return matches;
}

/**
 * List photos, optionally filtered by tag.
 */
export function filterPhotos(
    catalog: Catalog,
    tag?: string
): PhotoEntry[] {
    if (!tag) return catalog.photos;
    return catalog.photos.filter(p => p.tags.includes(tag));
}

/**
 * Get all unique tags in the catalog.
 */
export function allTags(catalog: Catalog): Map<string, number> {
    const tags = new Map<string, number>();
    for (const photo of catalog.photos) {
        for (const tag of photo.tags) {
            tags.set(tag, (tags.get(tag) ?? 0) + 1);
        }
    }
    return tags;
}
