import {
    MultiTrie,
    sha256HashFn,
    hashPrefixKeyFn,
    timePathKeyFn,
    timePathLeafKeys,
    diff,
    ContentAddressedTrie,
} from '@refinio/trie.core';
import type {Hash} from '@refinio/trie.core';
import type {FotosEntry, ExifData} from './types.js';

export interface FotosTrieSnapshot {
    entries: Record<string, FotosEntry>;
    timeEntries: Array<{id: string; timestamp: string}>;
}

export class FotosTrie {
    private readonly multi: MultiTrie;
    private readonly entries = new Map<string, FotosEntry>();
    private readonly trieId: string;
    private syncTrie!: ContentAddressedTrie;
    private timeTrie!: ContentAddressedTrie;

    private constructor(multi: MultiTrie, trieId: string) {
        this.multi = multi;
        this.trieId = trieId;
    }

    static async create(trieId: string): Promise<FotosTrie> {
        const multi = new MultiTrie([
            {
                name: 'sync',
                config: {
                    chunkSize: 2,
                    maxDepth: 4,
                    hashFn: sha256HashFn,
                    keyFn: hashPrefixKeyFn(2, 4),
                },
            },
            {
                name: 'time',
                config: {
                    chunkSize: 2,
                    maxDepth: 3,
                    hashFn: sha256HashFn,
                    keyFn: timePathKeyFn('day', trieId),
                },
            },
        ]);
        const ft = new FotosTrie(multi, trieId);
        ft.syncTrie = await multi.getTrie('sync');
        ft.timeTrie = await multi.getTrie('time');
        return ft;
    }

    async insert(entry: FotosEntry): Promise<void> {
        const id = entry.stream.id as Hash;
        const exif = entry.stream.exif as ExifData | undefined;
        const timestamp = exif?.date
            ? new Date(exif.date)
            : new Date(entry.stream.created);
        await this.multi.insert(id, {timestamp});
        this.entries.set(entry.stream.id, entry);
    }

    getEntry(id: string): FotosEntry | undefined {
        return this.entries.get(id);
    }

    /** Update an existing entry's metadata (for tag/untag). */
    updateEntry(id: string, entry: FotosEntry): void {
        this.entries.set(id, entry);
    }

    allEntries(): FotosEntry[] {
        return [...this.entries.values()];
    }

    entryCount(): number {
        return this.entries.size;
    }

    /** Query entries within a date range using the time trie. */
    queryDateRange(from: Date, to: Date): FotosEntry[] {
        const paths = timePathLeafKeys(from, to, this.trieId, 'day');
        const ids = new Set<string>();
        for (const path of paths) {
            for (const h of this.timeTrie.collectEntriesAtPath(path)) {
                ids.add(h);
            }
        }
        return [...ids]
            .map(id => this.entries.get(id))
            .filter((e): e is FotosEntry => e !== undefined);
    }

    async syncRoot(): Promise<Hash | null> {
        return this.multi.getRoot('sync');
    }

    /** Diff: find entry IDs in this trie that remote is missing. */
    diffFrom(remote: FotosTrie): string[] {
        const result = diff(remote.syncTrie, this.syncTrie);
        return result.missing as string[];
    }

    serialize(): FotosTrieSnapshot {
        const entries: Record<string, FotosEntry> = {};
        for (const [id, entry] of this.entries) {
            entries[id] = entry;
        }
        const timeEntries: Array<{id: string; timestamp: string}> = [];
        for (const entry of this.entries.values()) {
            const exif = entry.stream.exif as ExifData | undefined;
            const ts = exif?.date ?? new Date(entry.stream.created).toISOString();
            timeEntries.push({id: entry.stream.id, timestamp: ts});
        }
        return {entries, timeEntries};
    }

    static async fromSnapshot(
        snapshot: FotosTrieSnapshot,
        trieId: string
    ): Promise<FotosTrie> {
        const trie = await FotosTrie.create(trieId);
        // Restore entries
        for (const [id, entry] of Object.entries(snapshot.entries)) {
            trie.entries.set(id, entry);
        }
        // Rebuild tries by re-inserting all IDs with timestamps
        for (const {id, timestamp} of snapshot.timeEntries) {
            await trie.multi.insert(id as Hash, {
                timestamp: new Date(timestamp),
            });
        }
        // Re-fetch tries after inserts
        trie.syncTrie = await trie.multi.getTrie('sync');
        trie.timeTrie = await trie.multi.getTrie('time');
        return trie;
    }
}
