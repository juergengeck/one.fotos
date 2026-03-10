import {readFile, writeFile, stat, copyFile, mkdir} from 'node:fs/promises';
import {join, basename, dirname, relative, isAbsolute} from 'node:path';
import type {Stream} from '@refinio/chat.media';
import type {CatalogV2, FotosEntry, FotosConfig, ExifData} from './types.js';
import {DEFAULT_CONFIG} from './types.js';
import {FotosTrie} from './fotos-trie.js';
import type {FotosTrieSnapshot} from './fotos-trie.js';
import {hashFile, blobPath, computeStreamId, ownerToCreator, mimeFromPath} from './hash.js';
import {extractExif} from './exif.js';
import {generateThumb} from './thumbs.js';
import {initPlatform} from './platform.js';

const CATALOG_FILE = 'catalog.json';
const CONFIG_FILE = 'fotos.json';

interface CatalogV2OnDisk {
    version: 2;
    name: string;
    created: string;
    device?: string;
    trieSnapshot: FotosTrieSnapshot;
}

function normalizeFolderPath(value?: string): string | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value
        .replace(/\\/g, '/')
        .split('/')
        .map(segment => segment.trim())
        .filter(Boolean)
        .join('/');

    return normalized || undefined;
}

function folderPathFromSourcePath(sourcePath?: string): string | undefined {
    const normalized = normalizeFolderPath(sourcePath);
    if (!normalized) {
        return undefined;
    }

    const segments = normalized.split('/');
    segments.pop();
    return segments.length > 0 ? segments.join('/') : undefined;
}

function resolveFolderPath(catalogDir: string, filePath: string): string | undefined {
    const rawRelativeDir = relative(catalogDir, dirname(filePath));
    if (rawRelativeDir === '' || rawRelativeDir === '.') {
        return undefined;
    }

    const relativeDir = normalizeFolderPath(rawRelativeDir);
    if (relativeDir && !relativeDir.startsWith('..') && !isAbsolute(relativeDir)) {
        return relativeDir;
    }

    return normalizeFolderPath(dirname(filePath));
}

/**
 * Load catalog from working directory, or create empty one.
 * Migrates v1 catalogs to v2 (Stream-based) on load.
 */
export async function loadCatalog(dir: string): Promise<CatalogV2> {
    await initPlatform();
    const path = join(dir, CATALOG_FILE);
    try {
        const raw = await readFile(path, 'utf-8');
        const data = JSON.parse(raw);

        if (data.version === 1) {
            // Migrate v1 → v2 (Stream-based)
            const v1 = data as {
                version: 1;
                name: string;
                created: string;
                device?: string;
                photos: Array<{
                    hash: string;
                    name: string;
                managed: 'reference' | 'metadata' | 'ingested';
                sourcePath?: string;
                folderPath?: string;
                thumb?: string;
                tags: string[];
                    exif?: ExifData;
                    exifHash?: string;
                    addedAt: string;
                    size: number;
                    copies?: string[];
                }>;
            };
            const config = await loadConfig(dir);
            const creator = await ownerToCreator(config.owner ?? config.deviceName);
            const trie = await FotosTrie.create(v1.name);
            for (const photo of v1.photos) {
                const exif = photo.exif ?? {};
                const mimeType = mimeFromPath(photo.name);
                const streamId = await computeStreamId({
                    creator,
                    exifDate: exif.date,
                    mimeType,
                    contentHash: photo.hash,
                });
                const stream: Stream = {
                    $type$: 'Stream',
                    id: streamId,
                    creator: creator as any,
                    created: new Date(photo.addedAt).getTime(),
                    mimeType,
                    status: 'finalized',
                    exif: Object.keys(exif).length > 0 ? exif as Record<string, unknown> : undefined,
                };
                const entry: FotosEntry = {
                    stream,
                    name: photo.name,
                    managed: photo.managed,
                    sourcePath: photo.sourcePath,
                    folderPath: photo.folderPath ?? folderPathFromSourcePath(photo.sourcePath),
                    thumb: photo.thumb,
                    tags: photo.tags,
                    size: photo.size,
                    copies: photo.copies,
                };
                await trie.insert(entry);
            }
            return {
                version: 2,
                name: v1.name,
                created: v1.created,
                device: v1.device,
                trie,
            };
        }

        // v2: restore from snapshot
        const onDisk = data as CatalogV2OnDisk;
        const trie = await FotosTrie.fromSnapshot(onDisk.trieSnapshot, onDisk.name);
        return {
            version: 2,
            name: onDisk.name,
            created: onDisk.created,
            device: onDisk.device,
            trie,
        };
    } catch {
        // No file or parse error — create empty v2
        const name = basename(dir);
        const trie = await FotosTrie.create(name);
        return {
            version: 2,
            name,
            created: new Date().toISOString(),
            trie,
        };
    }
}

export async function saveCatalog(
    dir: string,
    catalog: CatalogV2
): Promise<void> {
    await initPlatform();
    const path = join(dir, CATALOG_FILE);
    const onDisk: CatalogV2OnDisk = {
        version: 2,
        name: catalog.name,
        created: catalog.created,
        device: catalog.device,
        trieSnapshot: catalog.trie.serialize(),
    };
    await writeFile(path, JSON.stringify(onDisk, null, 2) + '\n');
}

export async function loadConfig(dir: string): Promise<FotosConfig> {
    const path = join(dir, CONFIG_FILE);
    try {
        const raw = await readFile(path, 'utf-8');
        return {...DEFAULT_CONFIG, ...JSON.parse(raw)};
    } catch {
        return {...DEFAULT_CONFIG, owner: ''};
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

export interface AddResult {
    entry: FotosEntry;
    exif?: ExifData;
}

/**
 * Add a photo to the catalog.
 */
export async function addPhoto(
    dir: string,
    filePath: string,
    mode: AddMode
): Promise<AddResult> {
    const config = await loadConfig(dir);
    if (!config.owner) {
        throw new Error("No owner configured. Run 'fotos init --owner <name>' first.");
    }
    const catalog = await loadCatalog(dir);

    const contentHash = await hashFile(filePath);
    const mimeType = mimeFromPath(filePath);
    const creator = await ownerToCreator(config.owner);
    const fileStat = await stat(filePath);

    let exif: ExifData = {};

    // Extract EXIF for metadata/ingest modes
    if (mode === 'metadata' || mode === 'ingest') {
        exif = await extractExif(filePath);
    }

    // Compute deterministic stream ID
    const streamId = await computeStreamId({
        creator,
        exifDate: exif.date,
        mimeType,
        contentHash,
    });

    // Check for duplicate
    const existing = catalog.trie.getEntry(streamId);
    if (existing) {
        throw new Error(
            `Photo already in catalog: ${existing.name} (${streamId.slice(0, 8)})`
        );
    }

    const stream: Stream = {
        $type$: 'Stream',
        id: streamId,
        creator: creator as any,
        created: Date.now(),
        mimeType,
        status: 'finalized',
        exif: Object.keys(exif).length > 0 ? exif as Record<string, unknown> : undefined,
    };

    const entry: FotosEntry = {
        stream,
        name: basename(filePath),
        managed: mode === 'ingest' ? 'ingested' : mode,
        folderPath: resolveFolderPath(dir, filePath),
        tags: [],
        size: fileStat.size,
        copies: [config.deviceName],
    };

    // Reference mode: just store the source path
    if (mode === 'reference') {
        entry.sourcePath = filePath;
    }

    // Metadata mode: store source path + generate thumbnail
    if (mode === 'metadata' || mode === 'ingest') {
        entry.sourcePath = mode === 'metadata' ? filePath : undefined;
        const thumbDir = join(dir, config.thumbDir);
        entry.thumb = await generateThumb(
            filePath,
            streamId,
            thumbDir,
            config.thumbSize
        );
    }

    // Ingest mode: copy to blob store
    if (mode === 'ingest') {
        const blobDir = join(dir, config.blobDir);
        const dest = join(blobDir, blobPath(streamId));
        await mkdir(join(blobDir, streamId.slice(0, 2)), {recursive: true});
        await copyFile(filePath, dest);
    }

    await catalog.trie.insert(entry);
    await saveCatalog(dir, catalog);

    return {entry, exif: Object.keys(exif).length > 0 ? exif : undefined};
}

/**
 * Tag entries by stream ID prefix.
 */
export async function tagPhotos(
    dir: string,
    idPrefix: string,
    tags: string[]
): Promise<FotosEntry[]> {
    const catalog = await loadCatalog(dir);
    const matches = catalog.trie.allEntries().filter(e =>
        e.stream.id.startsWith(idPrefix)
    );

    if (matches.length === 0) {
        throw new Error(`No entries matching prefix: ${idPrefix}`);
    }

    for (const entry of matches) {
        for (const tag of tags) {
            if (!entry.tags.includes(tag)) {
                entry.tags.push(tag);
            }
        }
        await catalog.trie.updateEntry(entry.stream.id, entry);
    }

    await saveCatalog(dir, catalog);
    return matches;
}

/**
 * Remove tags from entries.
 */
export async function untagPhotos(
    dir: string,
    idPrefix: string,
    tags: string[]
): Promise<FotosEntry[]> {
    const catalog = await loadCatalog(dir);
    const matches = catalog.trie.allEntries().filter(e =>
        e.stream.id.startsWith(idPrefix)
    );

    if (matches.length === 0) {
        throw new Error(`No entries matching prefix: ${idPrefix}`);
    }

    for (const entry of matches) {
        entry.tags = entry.tags.filter(t => !tags.includes(t));
        await catalog.trie.updateEntry(entry.stream.id, entry);
    }

    await saveCatalog(dir, catalog);
    return matches;
}

/**
 * List entries, optionally filtered by tag.
 */
export async function filterPhotos(
    catalog: CatalogV2,
    tag?: string,
    folder?: string
): Promise<FotosEntry[]> {
    const entries = folder
        ? await catalog.trie.getEntriesForFolder(folder)
        : catalog.trie.allEntries();

    if (!tag) return entries;
    return entries.filter(e => e.tags.includes(tag));
}

/**
 * Get all unique tags in the catalog.
 */
export function allTags(catalog: CatalogV2): Map<string, number> {
    const tags = new Map<string, number>();
    for (const entry of catalog.trie.allEntries()) {
        for (const tag of entry.tags) {
            tags.set(tag, (tags.get(tag) ?? 0) + 1);
        }
    }
    return tags;
}
