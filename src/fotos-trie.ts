import {
    GalleryTrieManager,
    type GalleryIndexEntry,
} from '@refinio/fotos.core';
import type {Hash} from '@refinio/trie.core';
import type {FotosEntry, ExifData} from './types.js';

export interface FotosTrieSnapshot {
    entries: Record<string, FotosEntry>;
    timeEntries: Array<{id: string; timestamp: string}>;
}

type IndexedFotosEntry = FotosEntry & GalleryIndexEntry;

function resolveExif(entry: FotosEntry): ExifData | undefined {
    return entry.stream.exif as ExifData | undefined;
}

function toIsoTimestamp(value: number): string {
    return new Date(value).toISOString();
}

function entryTimestamp(entry: FotosEntry): string {
    return resolveExif(entry)?.date ?? toIsoTimestamp(entry.stream.created);
}

function toIndexedEntry(entry: FotosEntry): IndexedFotosEntry {
    const capturedAt = resolveExif(entry)?.date;
    const addedAt = toIsoTimestamp(entry.stream.created);

    return {
        ...entry,
        hash: entry.stream.id,
        addedAt,
        capturedAt,
        updatedAt: addedAt,
        sourcePath: entry.sourcePath,
    };
}

function stripIndexedEntry(entry: IndexedFotosEntry): FotosEntry {
    const {
        hash: _hash,
        addedAt: _addedAt,
        capturedAt: _capturedAt,
        updatedAt: _updatedAt,
        folderPath: _folderPath,
        ...plain
    } = entry;

    return plain;
}

function isWithinRange(timestamp: string, from: Date, to: Date): boolean {
    const value = new Date(timestamp).getTime();
    const start = Math.min(from.getTime(), to.getTime());
    const end = Math.max(from.getTime(), to.getTime());
    return value >= start && value <= end;
}

export class FotosTrie {
    private readonly gallery: GalleryTrieManager<IndexedFotosEntry>;

    private constructor(gallery: GalleryTrieManager<IndexedFotosEntry>) {
        this.gallery = gallery;
    }

    static async create(trieId: string): Promise<FotosTrie> {
        return new FotosTrie(new GalleryTrieManager<IndexedFotosEntry>(trieId));
    }

    async insert(entry: FotosEntry): Promise<void> {
        await this.gallery.upsertEntry(toIndexedEntry(entry));
    }

    getEntry(id: string): FotosEntry | undefined {
        const entry = this.gallery.getEntry(id);
        return entry ? stripIndexedEntry(entry) : undefined;
    }

    /** Update an existing entry's metadata (for tag/untag). */
    async updateEntry(id: string, entry: FotosEntry): Promise<void> {
        if (id !== entry.stream.id) {
            throw new Error(`Entry id mismatch: expected ${id}, got ${entry.stream.id}`);
        }

        await this.gallery.upsertEntry(toIndexedEntry(entry));
    }

    allEntries(): FotosEntry[] {
        return this.gallery.listEntries().map(stripIndexedEntry);
    }

    entryCount(): number {
        return this.gallery.listEntries().length;
    }

    /** Query entries within a date range using the shared capture-time trie. */
    async queryDateRange(from: Date, to: Date): Promise<FotosEntry[]> {
        const indexed = await this.gallery.getEntriesInDateRange(from, to);
        return indexed
            .filter(entry => isWithinRange(entryTimestamp(entry), from, to))
            .map(stripIndexedEntry);
    }

    async syncRoot(): Promise<Hash | null> {
        return await this.gallery.getRoot(
            'sync' as Parameters<GalleryTrieManager<IndexedFotosEntry>['getRoot']>[0]
        ) as Hash | null;
    }

    /** Diff: find entry IDs in this trie that remote is missing. */
    diffFrom(remote: FotosTrie): string[] {
        const remoteIds = new Set(remote.allEntries().map(entry => entry.stream.id));
        return this.allEntries()
            .map(entry => entry.stream.id)
            .filter(id => !remoteIds.has(id));
    }

    serialize(): FotosTrieSnapshot {
        const entries: Record<string, FotosEntry> = {};
        const timeEntries: Array<{id: string; timestamp: string}> = [];

        for (const entry of this.gallery.listEntries()) {
            const plain = stripIndexedEntry(entry);
            entries[plain.stream.id] = plain;
            timeEntries.push({
                id: plain.stream.id,
                timestamp: entryTimestamp(plain),
            });
        }

        return {entries, timeEntries};
    }

    static async fromSnapshot(
        snapshot: FotosTrieSnapshot,
        trieId: string
    ): Promise<FotosTrie> {
        const trie = await FotosTrie.create(trieId);
        await trie.gallery.replaceEntries(
            Object.values(snapshot.entries).map(toIndexedEntry)
        );
        return trie;
    }
}
