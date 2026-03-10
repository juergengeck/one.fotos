import {describe, it, expect, beforeEach} from 'vitest';
import {mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {importCollectionBundle} from '../src/import.js';
import {loadCatalog} from '../src/catalog.js';
import {blobPath} from '../src/hash.js';
import {FOTOS_BUNDLE_MANIFEST} from '../src/bundle.js';

describe('bundle import', () => {
    let targetDir: string;
    let bundleDir: string;

    beforeEach(() => {
        targetDir = mkdtempSync(join(tmpdir(), 'fotos-import-target-'));
        bundleDir = mkdtempSync(join(tmpdir(), 'fotos-import-bundle-'));
    });

    it('imports metadata bundles and copies thumbnails', async () => {
        const streamId = 'a'.repeat(64);
        const thumbName = `${streamId.slice(0, 8)}.jpg`;

        writeFileSync(join(bundleDir, FOTOS_BUNDLE_MANIFEST), JSON.stringify({
            version: 1,
            exportedAt: '2026-03-10T00:00:00.000Z',
            thumbDir: 'thumbs',
            blobDir: 'blobs',
            includesOriginals: false,
        }));
        writeFileSync(join(bundleDir, 'catalog.json'), JSON.stringify({
            version: 1,
            name: 'shared-bundle',
            created: '2026-03-10T00:00:00.000Z',
            photos: [{
                stream: {
                    $type$: 'Stream',
                    id: streamId,
                    creator: 'creator-1',
                    created: Date.parse('2025-01-01T10:00:00.000Z'),
                    mimeType: 'image/jpeg',
                    status: 'finalized',
                    exif: {date: '2025-01-01T10:00:00.000Z'},
                },
                name: 'photo.jpg',
                managed: 'metadata',
                folderPath: 'Trips/Berlin',
                thumb: thumbName,
                tags: ['travel'],
                size: 1234,
                exif: {date: '2025-01-01T10:00:00.000Z'},
            }],
        }));
        mkdirSync(join(bundleDir, 'thumbs'), {recursive: true});
        writeFileSync(join(bundleDir, 'thumbs', thumbName), 'thumb-data', {encoding: 'utf-8', flag: 'w'});

        const result = await importCollectionBundle(targetDir, bundleDir);
        const catalog = await loadCatalog(targetDir);
        const entry = catalog.trie.getEntry(streamId);

        expect(result).toEqual({
            imported: 1,
            skipped: 0,
            copiedThumbs: 1,
            copiedOriginals: 0,
        });
        expect(catalog.name).toBe('shared-bundle');
        expect(entry?.tags).toEqual(['travel']);
        expect(entry?.folderPath).toBe('Trips/Berlin');
        expect(entry?.thumb).toBe(thumbName);
        expect(existsSync(join(targetDir, 'thumbs', thumbName))).toBe(true);
    });

    it('imports originals for ingested bundles and skips duplicates', async () => {
        const streamId = 'b'.repeat(64);
        const relativeBlob = blobPath(streamId);

        writeFileSync(join(bundleDir, FOTOS_BUNDLE_MANIFEST), JSON.stringify({
            version: 1,
            exportedAt: '2026-03-10T00:00:00.000Z',
            thumbDir: 'thumbs',
            blobDir: 'blobs',
            includesOriginals: true,
        }));
        writeFileSync(join(bundleDir, 'catalog.json'), JSON.stringify({
            version: 1,
            name: 'with-originals',
            created: '2026-03-10T00:00:00.000Z',
            photos: [{
                stream: {
                    $type$: 'Stream',
                    id: streamId,
                    creator: 'creator-2',
                    created: Date.parse('2025-02-01T10:00:00.000Z'),
                    mimeType: 'image/jpeg',
                    status: 'finalized',
                },
                name: 'blob.jpg',
                managed: 'ingested',
                tags: [],
                size: 4567,
            }],
        }));
        mkdirSync(join(bundleDir, 'blobs', relativeBlob.slice(0, 2)), {recursive: true});
        writeFileSync(join(bundleDir, 'blobs', relativeBlob), 'blob-data', {encoding: 'utf-8', flag: 'w'});

        const first = await importCollectionBundle(targetDir, bundleDir);
        const second = await importCollectionBundle(targetDir, bundleDir);
        const importedBlob = join(targetDir, 'blobs', relativeBlob);
        const catalog = await loadCatalog(targetDir);

        expect(first).toEqual({
            imported: 1,
            skipped: 0,
            copiedThumbs: 0,
            copiedOriginals: 1,
        });
        expect(second.imported).toBe(0);
        expect(second.skipped).toBe(1);
        expect(existsSync(importedBlob)).toBe(true);
        expect(readFileSync(importedBlob, 'utf-8')).toBe('blob-data');
        expect(catalog.trie.getEntry(streamId)?.managed).toBe('ingested');
    });
});
