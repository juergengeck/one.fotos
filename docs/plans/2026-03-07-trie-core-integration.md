# trie.core Integration for one.fotos

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat `catalog.json` array with a trie.core `MultiTrie` that enables Merkle sync between devices and O(range) time-indexed photo browsing.

**Architecture:** A `FotosTrie` wraps a `MultiTrie` with two slots: `sync` (hash-prefix, for Merkle diff between devices) and `time` (time-path at day depth, for date-range queries). Photo metadata is stored in a separate `Map<Hash, PhotoEntry>` (the "entry store") keyed by the photo's content hash. The trie only stores hashes — metadata lives alongside it. Both are serialized to disk. one.core provides platform-abstracted crypto via `createCryptoHash`. trie.core provides the trie structures.

**Tech Stack:** `@refinio/trie.core` (MultiTrie, ContentAddressedTrie, diff, serialize), `@refinio/one.core` (createCryptoHash, platform init), Node.js, vitest

---

## Dependency Chain

```
one.core (platform crypto)
  └── trie.core (ContentAddressedTrie, MultiTrie, diff, serialize)
        └── one.fotos (FotosTrie = MultiTrie + PhotoEntry store)
              └── fotos.browser (reads trie via API)
```

one.fotos currently uses raw `node:crypto` in `src/hash.ts`. This gets replaced by one.core's `createCryptoHash` for consistency with the rest of the platform.

## Data Model Change

**Before:** `catalog.json` = `{ version, name, photos: PhotoEntry[] }`
**After:**
- `catalog.json` = `{ version, name, device, syncRoot, timeRoot, trieSnapshot, entries }` where:
  - `trieSnapshot` = serialized MultiTrie state (both slots)
  - `entries` = `Record<string, PhotoEntry>` keyed by content hash
  - `syncRoot` / `timeRoot` = root hashes for quick equality check

The `PhotoEntry` type is unchanged. The trie stores photo content hashes; the entry store maps hash → metadata.

---

### Task 1: Add one.core and trie.core dependencies

**Files:**
- Modify: `package.json`

**Step 1: Add dependencies**

```json
{
  "dependencies": {
    "@refinio/one.core": "workspace:*",
    "@refinio/trie.core": "workspace:*",
    "commander": "^12.0.0",
    "exifreader": "^4.14.0",
    "sharp": "^0.33.0"
  }
}
```

Note: one.fotos lives inside the lama monorepo at `packages/one.fotos`, so `workspace:*` resolves correctly via pnpm.

**Step 2: Install**

Run: `cd /Users/gecko/src/lama && ONNXRUNTIME_NODE_INSTALL=skip pnpm install`

**Step 3: Verify import resolves**

Create a scratch file, import `{ sha256HashFn } from '@refinio/trie.core'`, run `npx tsc --noEmit`. Delete scratch file.

**Step 4: Commit**

```bash
git add package.json
git commit -m "Add one.core and trie.core dependencies"
```

---

### Task 2: Platform init helper + replace raw crypto

**Files:**
- Create: `src/platform.ts`
- Modify: `src/hash.ts`
- Test: `test/hash.test.ts` (new)

one.core requires platform initialization before crypto works. Create a helper that loads the Node.js platform once.

**Step 1: Write the failing test**

Create `test/hash.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { initPlatform } from '../src/platform.js';
import { hashFile, hashString } from '../src/hash.js';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('hash', () => {
    beforeAll(async () => {
        await initPlatform();
    });

    it('hashString produces consistent SHA-256', async () => {
        const h1 = await hashString('hello');
        const h2 = await hashString('hello');
        expect(h1).toBe(h2);
        expect(h1.length).toBe(64); // hex SHA-256
    });

    it('hashFile hashes file content', async () => {
        const tmp = join(tmpdir(), 'fotos-test-hash.txt');
        writeFileSync(tmp, 'test content');
        const h = await hashFile(tmp);
        expect(h.length).toBe(64);
        unlinkSync(tmp);
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/hash.test.ts`
Expected: FAIL — `initPlatform` and `hashString` don't exist yet.

**Step 3: Create `src/platform.ts`**

```typescript
let initialized = false;

export async function initPlatform(): Promise<void> {
    if (initialized) return;
    // Load one.core Node.js platform
    await import('@refinio/one.core/lib/system/load-platform.js');
    initialized = true;
}
```

Check exact path: `ls /Users/gecko/src/lama/packages/one.core/lib/system/load-platform.*` — if it's `load-nodejs-platform.js`, use that instead. The pattern varies across one.core versions.

**Step 4: Update `src/hash.ts`**

Replace raw `node:crypto` with one.core's `createCryptoHash`:

```typescript
import { createCryptoHash } from '@refinio/one.core/lib/system/crypto-helpers.js';
import { readFile } from 'node:fs/promises';

/**
 * Compute SHA-256 hash of a file via one.core platform crypto.
 */
export async function hashFile(filePath: string): Promise<string> {
    const buffer = await readFile(filePath);
    return createCryptoHash(buffer.toString('base64'));
}

/**
 * SHA-256 hash of a string. Used by trie operations.
 */
export async function hashString(data: string): Promise<string> {
    return createCryptoHash(data);
}

/**
 * Get blob storage path from hash: ab/cdef0123...
 */
export function blobPath(hash: string): string {
    return `${hash.slice(0, 2)}/${hash}`;
}
```

**Important:** `hashFile` must produce the same hashes as before for existing catalogs. The old implementation hashed raw bytes; the new one hashes base64. If backward compatibility matters, keep hashing raw bytes by reading as a hex string or using the one.core binary hash path. Verify by hashing a known file both ways.

**Step 5: Run test to verify it passes**

Run: `npx vitest run test/hash.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/platform.ts src/hash.ts test/hash.test.ts
git commit -m "Replace raw node:crypto with one.core platform crypto"
```

---

### Task 3: Create FotosTrie — MultiTrie wrapper for photos

**Files:**
- Create: `src/fotos-trie.ts`
- Test: `test/fotos-trie.test.ts` (new)

This is the core new data structure. Wraps a `MultiTrie` with two slots and a `Map<string, PhotoEntry>` for metadata.

**Step 1: Write the failing test**

Create `test/fotos-trie.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { initPlatform } from '../src/platform.js';
import { FotosTrie } from '../src/fotos-trie.js';
import type { PhotoEntry } from '../src/types.js';

const makeEntry = (hash: string, date: string): PhotoEntry => ({
    hash,
    name: `photo-${hash.slice(0, 4)}.jpg`,
    managed: 'metadata',
    tags: ['test'],
    addedAt: new Date().toISOString(),
    size: 1000,
    exif: { date },
});

describe('FotosTrie', () => {
    beforeAll(async () => {
        await initPlatform();
    });

    it('insert and retrieve a photo', async () => {
        const trie = await FotosTrie.create('test-collection');
        const entry = makeEntry('a'.repeat(64), '2025-08-15T10:30:00');
        await trie.insert(entry);
        expect(trie.getEntry(entry.hash)).toEqual(entry);
        expect(trie.allEntries()).toHaveLength(1);
    });

    it('query by date range', async () => {
        const trie = await FotosTrie.create('test-collection');
        await trie.insert(makeEntry('a'.repeat(64), '2025-08-15T10:00:00'));
        await trie.insert(makeEntry('b'.repeat(64), '2025-09-01T14:00:00'));
        await trie.insert(makeEntry('c'.repeat(64), '2025-12-25T09:00:00'));

        const aug = trie.queryDateRange(new Date('2025-08-01'), new Date('2025-08-31'));
        expect(aug).toHaveLength(1);
        expect(aug[0].hash).toBe('a'.repeat(64));

        const all = trie.queryDateRange(new Date('2025-01-01'), new Date('2025-12-31'));
        expect(all).toHaveLength(3);
    });

    it('sync root changes on insert', async () => {
        const trie = await FotosTrie.create('test-collection');
        const root1 = await trie.syncRoot();
        expect(root1).toBeNull();

        await trie.insert(makeEntry('a'.repeat(64), '2025-08-15T10:00:00'));
        const root2 = await trie.syncRoot();
        expect(root2).not.toBeNull();
    });

    it('diff finds missing entries', async () => {
        const trieA = await FotosTrie.create('device-a');
        const trieB = await FotosTrie.create('device-b');

        await trieA.insert(makeEntry('a'.repeat(64), '2025-08-15T10:00:00'));
        await trieA.insert(makeEntry('b'.repeat(64), '2025-09-01T14:00:00'));
        await trieB.insert(makeEntry('a'.repeat(64), '2025-08-15T10:00:00'));

        const missing = trieA.diffFrom(trieB);
        expect(missing).toHaveLength(1);
        expect(missing[0]).toBe('b'.repeat(64));
    });

    it('serialize and restore round-trips', async () => {
        const trie = await FotosTrie.create('test-collection');
        await trie.insert(makeEntry('a'.repeat(64), '2025-08-15T10:00:00'));
        await trie.insert(makeEntry('b'.repeat(64), '2025-09-01T14:00:00'));

        const snapshot = trie.serialize();
        const restored = await FotosTrie.fromSnapshot(snapshot, 'test-collection');

        expect(restored.allEntries()).toHaveLength(2);
        expect(restored.getEntry('a'.repeat(64))).toBeDefined();
        expect(await restored.syncRoot()).toBe(await trie.syncRoot());
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/fotos-trie.test.ts`
Expected: FAIL — `FotosTrie` doesn't exist.

**Step 3: Implement `src/fotos-trie.ts`**

```typescript
import {
    MultiTrie,
    sha256HashFn,
    hashPrefixKeyFn,
    timePathKeyFn,
    timePathLeafKeys,
    diff,
    serializeTrie,
} from '@refinio/trie.core';
import type { Hash, TrieReader } from '@refinio/trie.core';
import type { PhotoEntry } from './types.js';

export interface FotosTrieSnapshot {
    entries: Record<string, PhotoEntry>;
    syncEntries: string[];
    timeEntries: Array<{ hash: string; timestamp: string }>;
}

export class FotosTrie {
    private readonly multi: MultiTrie;
    private readonly entries = new Map<string, PhotoEntry>();
    private readonly trieId: string;

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
        return new FotosTrie(multi, trieId);
    }

    async insert(entry: PhotoEntry): Promise<void> {
        const hash = entry.hash as Hash;
        const timestamp = entry.exif?.date
            ? new Date(entry.exif.date)
            : new Date(entry.addedAt);
        await this.multi.insert(hash, { timestamp });
        this.entries.set(entry.hash, entry);
    }

    getEntry(hash: string): PhotoEntry | undefined {
        return this.entries.get(hash);
    }

    allEntries(): PhotoEntry[] {
        return [...this.entries.values()];
    }

    /** Query photos within a date range using the time trie. */
    queryDateRange(from: Date, to: Date): PhotoEntry[] {
        const paths = timePathLeafKeys(from, to, this.trieId, 'day');
        const hashes = new Set<string>();
        for (const path of paths) {
            // collectEntriesAtPath is sync on the underlying trie
            const trie = this.getSyncTrie('time');
            for (const h of trie.collectEntriesAtPath(path)) {
                hashes.add(h);
            }
        }
        return [...hashes]
            .map(h => this.entries.get(h))
            .filter((e): e is PhotoEntry => e !== undefined);
    }

    async syncRoot(): Promise<Hash | null> {
        return this.multi.getRoot('sync');
    }

    /** Diff: find entries in this trie that remote is missing. */
    diffFrom(remote: FotosTrie): string[] {
        const localSync = this.getSyncTrie('sync');
        const remoteSync = remote.getSyncTrie('sync');
        const result = diff(localSync, remoteSync);
        return result.missing as string[];
    }

    serialize(): FotosTrieSnapshot {
        const entries: Record<string, PhotoEntry> = {};
        for (const [hash, entry] of this.entries) {
            entries[hash] = entry;
        }
        // Store enough info to rebuild tries
        const timeEntries: Array<{ hash: string; timestamp: string }> = [];
        for (const entry of this.entries.values()) {
            const ts = entry.exif?.date ?? entry.addedAt;
            timeEntries.push({ hash: entry.hash, timestamp: ts });
        }
        return {
            entries,
            syncEntries: [...this.entries.keys()],
            timeEntries,
        };
    }

    static async fromSnapshot(snapshot: FotosTrieSnapshot, trieId: string): Promise<FotosTrie> {
        const trie = await FotosTrie.create(trieId);
        for (const [hash, entry] of Object.entries(snapshot.entries)) {
            trie.entries.set(hash, entry);
        }
        // Rebuild tries by re-inserting all hashes
        for (const { hash, timestamp } of snapshot.timeEntries) {
            await trie.multi.insert(hash as Hash, {
                timestamp: new Date(timestamp),
            });
        }
        return trie;
    }

    /** Access underlying ContentAddressedTrie for a slot (sync use). */
    private getSyncTrie(name: string) {
        // MultiTrie.getTrie is async but the underlying trie is already instantiated
        // after any insert. We need sync access for diff/query.
        // Use collectEntriesAtPath via multi's async wrapper instead.
        // For diff, we need TrieReader — get it via getTrie().
        throw new Error('Use multi.getTrie() — see implementation note');
    }
}
```

**Implementation note:** The `getSyncTrie` helper and `diffFrom`/`queryDateRange` need sync access to the `ContentAddressedTrie`. `MultiTrie.getTrie()` is async but trivially resolves (it's already instantiated). Two options:

1. Store refs to the `ContentAddressedTrie` instances after first access
2. Make `diffFrom` and `queryDateRange` async

Option 1 is cleaner. After `create()`, call `await multi.getTrie('sync')` and `await multi.getTrie('time')` and cache them as private fields.

Revise the constructor pattern:

```typescript
private syncTrie!: ContentAddressedTrie;
private timeTrie!: ContentAddressedTrie;

static async create(trieId: string): Promise<FotosTrie> {
    // ... create multi ...
    const ft = new FotosTrie(multi, trieId);
    ft.syncTrie = await multi.getTrie('sync');
    ft.timeTrie = await multi.getTrie('time');
    return ft;
}
```

Then `diffFrom` uses `diff(this.syncTrie, remote.syncTrie)` directly and `queryDateRange` uses `this.timeTrie.collectEntriesAtPath(path)`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/fotos-trie.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/fotos-trie.ts test/fotos-trie.test.ts
git commit -m "FotosTrie: MultiTrie wrapper with sync + time slots"
```

---

### Task 4: Migrate catalog.ts to use FotosTrie

**Files:**
- Modify: `src/catalog.ts`
- Modify: `src/types.ts` (add `CatalogV2` type)
- Test: `test/catalog.test.ts` (new)

The catalog layer switches from flat JSON array to FotosTrie-backed storage. Backward compatible: if it reads an old `catalog.json` (v1 with `photos[]`), it migrates on load.

**Step 1: Write the failing test**

Create `test/catalog.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initPlatform } from '../src/platform.js';
import { loadCatalog, saveCatalog, addPhoto } from '../src/catalog.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('catalog with trie', () => {
    let dir: string;

    beforeAll(async () => {
        await initPlatform();
    });

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'fotos-test-'));
    });

    it('loads empty catalog as v2', async () => {
        const catalog = await loadCatalog(dir);
        expect(catalog.version).toBe(2);
        expect(catalog.trie.allEntries()).toHaveLength(0);
    });

    it('migrates v1 catalog on load', async () => {
        // Write a v1 catalog
        writeFileSync(join(dir, 'catalog.json'), JSON.stringify({
            version: 1,
            name: 'old-collection',
            created: '2025-01-01T00:00:00Z',
            photos: [
                {
                    hash: 'a'.repeat(64),
                    name: 'test.jpg',
                    managed: 'metadata',
                    tags: ['vacation'],
                    addedAt: '2025-08-15T10:00:00Z',
                    size: 5000,
                    exif: { date: '2025-08-15T10:00:00' },
                }
            ]
        }));

        const catalog = await loadCatalog(dir);
        expect(catalog.version).toBe(2);
        expect(catalog.trie.allEntries()).toHaveLength(1);
        expect(catalog.trie.getEntry('a'.repeat(64))?.name).toBe('test.jpg');
    });

    it('save and reload round-trips', async () => {
        const catalog = await loadCatalog(dir);
        const entry = {
            hash: 'b'.repeat(64),
            name: 'photo.jpg',
            managed: 'metadata' as const,
            tags: [],
            addedAt: new Date().toISOString(),
            size: 3000,
        };
        await catalog.trie.insert(entry);
        await saveCatalog(dir, catalog);

        const reloaded = await loadCatalog(dir);
        expect(reloaded.trie.allEntries()).toHaveLength(1);
        expect(reloaded.trie.getEntry('b'.repeat(64))?.name).toBe('photo.jpg');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/catalog.test.ts`
Expected: FAIL

**Step 3: Update `src/types.ts`**

Add a `CatalogV2` interface alongside the existing types:

```typescript
import type { FotosTrie } from './fotos-trie.js';

export interface CatalogV2 {
    version: 2;
    name: string;
    created: string;
    device?: string;
    trie: FotosTrie;
}
```

Keep the existing `Catalog` type (renamed to `CatalogV1`) for migration.

**Step 4: Update `src/catalog.ts`**

Modify `loadCatalog` to:
1. Read `catalog.json`
2. If `version: 1`, migrate: create `FotosTrie`, insert all `photos[]` entries
3. If `version: 2`, deserialize from `FotosTrieSnapshot`
4. Return `CatalogV2`

Modify `saveCatalog` to serialize the `FotosTrie` snapshot + metadata.

Update all functions (`addPhoto`, `tagPhotos`, `untagPhotos`, `filterPhotos`, `allTags`) to work with `CatalogV2.trie` instead of `catalog.photos[]`.

**Step 5: Run test to verify it passes**

Run: `npx vitest run test/catalog.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/types.ts src/catalog.ts test/catalog.test.ts
git commit -m "Migrate catalog to FotosTrie-backed storage with v1 migration"
```

---

### Task 5: Update CLI commands for CatalogV2

**Files:**
- Modify: `src/cli.ts`

All CLI commands currently work with `catalog.photos[]`. Update them to use `catalog.trie.allEntries()`, `catalog.trie.getEntry()`, `catalog.trie.queryDateRange()`.

Key changes:
- `list`: use `trie.allEntries()` or `trie.queryDateRange()` if `--from`/`--to` flags provided
- `add`: use `trie.insert()`
- `tag`/`untag`: update entry in trie's entry store
- `view`/`json`/`export`: use `trie.allEntries()` to get photos array
- `status`: use `trie.syncRoot()` to show Merkle root
- Add `init` call to `initPlatform()` before any command runs

Add a new `diff` command:
```
fotos diff <remote-catalog-path>
```
Loads both catalogs, runs `trie.diffFrom()`, prints missing entries.

**Step 1: Add platform init**

At the top of `cli.ts`, before `program.parse()`:

```typescript
import { initPlatform } from './platform.js';

// ... program definition ...

// Initialize platform before running any command
program.hook('preAction', async () => {
    await initPlatform();
});
```

**Step 2: Update each command**

Replace `catalog.photos` references with trie equivalents. The `filterPhotos` helper moves to querying the trie.

**Step 3: Build and manual test**

Run: `npm run build && node dist/cli.js status`
Expected: Shows collection info with Merkle root hash.

**Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "Update CLI commands for trie-backed catalog"
```

---

### Task 6: Update fotos.browser scan API to serve trie data

**Files:**
- Modify: `../fotos.browser/browser-ui/vite.config.ts`
- Modify: `../fotos.browser/browser-ui/src/hooks/useGallery.ts`
- Modify: `../fotos.browser/browser-ui/src/types/fotos.ts`

The browser app currently scans the filesystem directly. Add an API endpoint that can also serve a trie-backed catalog if one exists, and expose date-range query capability.

Add `/api/catalog` endpoint: if a `catalog.json` exists in the configured collection dir, serve the entries from it. The browser app can then show trie-managed photos alongside filesystem-scanned photos.

Add `/api/query?from=2025-08-01&to=2025-08-31` endpoint for date-range queries (calls `trie.queryDateRange()`).

**Step 1: Update vite plugin**

Add the new endpoints to the `localPhotosPlugin` in `vite.config.ts`.

**Step 2: Update useGallery**

Add optional catalog loading alongside the filesystem scan.

**Step 3: Commit**

```bash
git add ../fotos.browser/browser-ui/vite.config.ts
git add ../fotos.browser/browser-ui/src/hooks/useGallery.ts
git commit -m "Browser app: serve trie-backed catalog via API"
```

---

### Task 7: Add vitest config + test setup

**Files:**
- Create: `vitest.config.ts`
- Create: `test/setup.ts`

one.core platform must be loaded before any test that uses crypto. Create a vitest setup file.

**Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        setupFiles: ['./test/setup.ts'],
    },
});
```

**Step 2: Create `test/setup.ts`**

```typescript
import { initPlatform } from '../src/platform.js';

// Load one.core Node.js platform before all tests
await initPlatform();
```

**Step 3: Add vitest to devDependencies and test script**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "catalog:",
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0"
  }
}
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add vitest.config.ts test/setup.ts package.json
git commit -m "Add vitest config with one.core platform setup"
```

---

## Task Order

Task 7 (vitest setup) should be done **first** — tests need the platform before anything else.

Recommended execution order:
1. Task 7 — vitest config + platform setup
2. Task 1 — add dependencies
3. Task 2 — platform init + replace crypto
4. Task 3 — FotosTrie (core data structure)
5. Task 4 — migrate catalog.ts
6. Task 5 — update CLI
7. Task 6 — update browser app

---

## Key Decisions

1. **Day depth for time trie**: Photos are typically browsed by day, not minute. `timePathKeyFn('day', trieId)` gives 3-level depth (year → month → day). This keeps the trie shallow and efficient for photo volumes.

2. **Entry store is separate from trie**: The trie only stores hashes (lightweight). Photo metadata lives in a `Map<string, PhotoEntry>` serialized alongside. This matches how chat.core stores message data separately from the ChatTrie.

3. **Backward compatible migration**: v1 catalogs auto-migrate on first load. The migration inserts each `photos[]` entry into the trie.

4. **one.core crypto throughout**: No more raw `node:crypto`. `sha256HashFn` from trie.core (which wraps one.core) is the single hash implementation. File hashing in `hashFile` also uses one.core.

5. **Serialization strategy**: We store the entry list + timestamps, and rebuild the trie on load by re-inserting. This avoids persisting internal trie node structure and leverages the determinism guarantee (same entries → same root).
