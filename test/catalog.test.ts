import {describe, it, expect, beforeEach} from 'vitest';
import {loadCatalog, saveCatalog, filterPhotos} from '../src/catalog.js';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import type {Stream} from '@refinio/chat.media';

describe('catalog with trie', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'fotos-test-'));
    });

    it('loads empty catalog as v2', async () => {
        const catalog = await loadCatalog(dir);
        expect(catalog.version).toBe(2);
        expect(catalog.trie.allEntries()).toHaveLength(0);
    });

    it('migrates v1 catalog on load', async () => {
        // Write a fotos.json with owner so migration can compute creator
        writeFileSync(join(dir, 'fotos.json'), JSON.stringify({
            owner: 'test-owner',
            deviceName: 'test-device',
        }));

        writeFileSync(join(dir, 'catalog.json'), JSON.stringify({
            version: 1,
            name: 'old-collection',
            created: '2025-01-01T00:00:00Z',
            photos: [{
                hash: 'a'.repeat(64),
                name: 'test.jpg',
                managed: 'metadata',
                sourcePath: 'Trips/Berlin/test.jpg',
                tags: ['vacation'],
                addedAt: '2025-08-15T10:00:00Z',
                size: 5000,
                exif: {date: '2025-08-15T10:00:00'},
            }]
        }));

        const catalog = await loadCatalog(dir);
        expect(catalog.version).toBe(2);
        expect(catalog.trie.allEntries()).toHaveLength(1);
        const entry = catalog.trie.allEntries()[0];
        expect(entry.name).toBe('test.jpg');
        expect(entry.tags).toEqual(['vacation']);
        expect(entry.folderPath).toBe('Trips/Berlin');
        expect(entry.stream.mimeType).toBe('image/jpeg');
        expect(entry.stream.exif).toEqual({date: '2025-08-15T10:00:00'});
    });

    it('save and reload round-trips', async () => {
        const catalog = await loadCatalog(dir);
        const id = 'b'.repeat(64);
        await catalog.trie.insert({
            stream: {
                $type$: 'Stream',
                id,
                creator: 'test-creator' as any,
                created: Date.now(),
                mimeType: 'image/jpeg',
                status: 'finalized',
            } as Stream,
            name: 'photo.jpg',
            managed: 'metadata',
            folderPath: 'Trips/Berlin',
            tags: [],
            size: 3000,
        });
        await saveCatalog(dir, catalog);

        const reloaded = await loadCatalog(dir);
        expect(reloaded.trie.allEntries()).toHaveLength(1);
        expect(reloaded.trie.getEntry(id)?.name).toBe('photo.jpg');
        expect(reloaded.trie.getEntry(id)?.folderPath).toBe('Trips/Berlin');
    });

    it('filters by shared folder trie', async () => {
        const catalog = await loadCatalog(dir);
        await catalog.trie.insert({
            stream: {
                $type$: 'Stream',
                id: 'c'.repeat(64),
                creator: 'test-creator' as any,
                created: Date.parse('2025-08-15T10:00:00Z'),
                mimeType: 'image/jpeg',
                status: 'finalized',
                exif: {date: '2025-08-15T10:00:00Z'},
            } as Stream,
            name: 'berlin.jpg',
            managed: 'metadata',
            folderPath: 'Trips/Berlin',
            tags: ['travel'],
            size: 1000,
        });
        await catalog.trie.insert({
            stream: {
                $type$: 'Stream',
                id: 'd'.repeat(64),
                creator: 'test-creator' as any,
                created: Date.parse('2025-09-15T10:00:00Z'),
                mimeType: 'image/jpeg',
                status: 'finalized',
                exif: {date: '2025-09-15T10:00:00Z'},
            } as Stream,
            name: 'family.jpg',
            managed: 'metadata',
            folderPath: 'Family',
            tags: ['family'],
            size: 1000,
        });

        expect((await filterPhotos(catalog, undefined, 'Trips')).map(entry => entry.name)).toEqual([
            'berlin.jpg',
        ]);
        expect((await filterPhotos(catalog, 'travel', 'Trips/Berlin')).map(entry => entry.name)).toEqual([
            'berlin.jpg',
        ]);
    });
});
