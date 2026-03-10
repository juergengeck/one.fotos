import {describe, it, expect} from 'vitest';
import {FotosTrie} from '../src/fotos-trie.js';
import type {FotosEntry} from '../src/types.js';
import type {Stream} from '@refinio/chat.media';

const makeEntry = (
    id: string,
    date: string,
    tags: string[] = ['test'],
    folderPath?: string
): FotosEntry => ({
    stream: {
        $type$: 'Stream',
        id,
        creator: 'test-creator' as any,
        created: Date.now(),
        mimeType: 'image/jpeg',
        status: 'finalized',
        exif: {date},
    } as Stream,
    name: `photo-${id.slice(0, 4)}.jpg`,
    managed: 'metadata',
    folderPath,
    tags,
    size: 1000,
});

describe('FotosTrie', () => {
    it('insert and retrieve a photo', async () => {
        const trie = await FotosTrie.create('test');
        const entry = makeEntry('a'.repeat(64), '2025-08-15T10:30:00');
        await trie.insert(entry);
        expect(trie.getEntry(entry.stream.id)).toEqual(entry);
        expect(trie.allEntries()).toHaveLength(1);
    });

    it('query by date range', async () => {
        const trie = await FotosTrie.create('test');
        await trie.insert(makeEntry('a'.repeat(64), '2025-08-15T10:00:00', ['test'], 'Trips/Berlin'));
        await trie.insert(makeEntry('b'.repeat(64), '2025-09-01T14:00:00', ['test'], 'Trips/Berlin'));
        await trie.insert(makeEntry('c'.repeat(64), '2025-12-25T09:00:00', ['test'], 'Family'));

        const aug = await trie.queryDateRange(new Date('2025-08-01'), new Date('2025-08-31'));
        expect(aug).toHaveLength(1);
        expect(aug[0].stream.id).toBe('a'.repeat(64));

        const all = await trie.queryDateRange(new Date('2025-01-01'), new Date('2025-12-31'));
        expect(all).toHaveLength(3);
    });

    it('query by folder path', async () => {
        const trie = await FotosTrie.create('test');
        await trie.insert(makeEntry('a'.repeat(64), '2025-08-15T10:00:00', ['test'], 'Trips/Berlin'));
        await trie.insert(makeEntry('b'.repeat(64), '2025-09-01T14:00:00', ['test'], 'Trips/Berlin'));
        await trie.insert(makeEntry('c'.repeat(64), '2025-12-25T09:00:00', ['test'], 'Family'));

        expect((await trie.getEntriesForFolder('Trips')).map(entry => entry.stream.id)).toEqual([
            'b'.repeat(64),
            'a'.repeat(64),
        ]);
        expect((await trie.getEntriesForFolder('Trips/Berlin')).map(entry => entry.stream.id)).toEqual([
            'b'.repeat(64),
            'a'.repeat(64),
        ]);
        expect((await trie.getEntriesForFolder('Family')).map(entry => entry.stream.id)).toEqual([
            'c'.repeat(64),
        ]);
    });

    it('sync root changes on insert', async () => {
        const trie = await FotosTrie.create('test');
        expect(await trie.syncRoot()).toBeNull();

        await trie.insert(makeEntry('a'.repeat(64), '2025-08-15T10:00:00'));
        expect(await trie.syncRoot()).not.toBeNull();
    });

    it('diff finds missing entries', async () => {
        const trieA = await FotosTrie.create('a');
        const trieB = await FotosTrie.create('b');

        await trieA.insert(makeEntry('a'.repeat(64), '2025-08-15T10:00:00'));
        await trieA.insert(makeEntry('b'.repeat(64), '2025-09-01T14:00:00'));
        await trieB.insert(makeEntry('a'.repeat(64), '2025-08-15T10:00:00'));

        const missing = trieA.diffFrom(trieB);
        expect(missing).toHaveLength(1);
        expect(missing[0]).toBe('b'.repeat(64));
    });

    it('serialize and restore round-trips', async () => {
        const trie = await FotosTrie.create('test');
        await trie.insert(makeEntry('a'.repeat(64), '2025-08-15T10:00:00', ['test'], 'Trips/Berlin'));
        await trie.insert(makeEntry('b'.repeat(64), '2025-09-01T14:00:00', ['test'], 'Trips/Paris'));

        const snapshot = trie.serialize();
        const restored = await FotosTrie.fromSnapshot(snapshot, 'test');

        expect(restored.allEntries()).toHaveLength(2);
        expect(restored.getEntry('a'.repeat(64))).toBeDefined();
        expect(restored.getEntry('a'.repeat(64))?.folderPath).toBe('Trips/Berlin');
        expect(await restored.syncRoot()).toBe(await trie.syncRoot());
    });

    it('updateEntry modifies metadata without affecting trie', async () => {
        const trie = await FotosTrie.create('test');
        const entry = makeEntry('a'.repeat(64), '2025-08-15T10:00:00', ['landscape']);
        await trie.insert(entry);

        const updated = {...entry, tags: ['landscape', 'sunset']};
        await trie.updateEntry(entry.stream.id, updated);

        expect(trie.getEntry(entry.stream.id)?.tags).toEqual(['landscape', 'sunset']);
    });
});
