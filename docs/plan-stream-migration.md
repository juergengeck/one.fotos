# Plan: Content-Addressed Stream + one.fotos Migration

## Summary

Replace UUID-based Stream identity with deterministic content-addressed computation. Add typed metadata properties (exif, xmp, iptc) as top-level fields. Migrate one.fotos from PhotoEntry to Stream-based media model.

## Architecture

### Stream Identity (deterministic, no UUID)

Stream.id is computed from available context, not random:

```
1. Rich metadata:  hash(creator + exifDate + mimeType)  — "photo taken by X at time Y"
2. Creator+time:   hash(creator + created + mimeType)   — "recorded by X at time Y"
3. Content hash:   imageDataHash                         — "we know what it is, not where it came from"
```

The `id` field stays as the single `isId: true` field. Only the computation changes.

### Stream Properties (typed, not generic bag)

```
Stream {
    $type$: 'Stream'
    id: string                        // isId: true, deterministic
    creator: SHA256IdHash<Person>     // immutable
    created: number                   // immutable, unix timestamp
    mimeType: string                  // immutable
    status: StreamStatus              // mutable
    exif?: Record<string, unknown>    // mutable, versioned with object
    xmp?: Record<string, unknown>     // mutable, versioned with object
    iptc?: Record<string, unknown>    // mutable, versioned with object
}
```

Updating any property = new version of the whole Stream (content hash changes, id stays).

### one.fotos: FotosEntry wraps Stream

```
FotosEntry {
    stream: Stream                    // the media object (shared type)
    name: string                      // original filename
    managed: 'reference' | 'metadata' | 'ingested'
    sourcePath?: string
    thumb?: string
    tags: string[]
    size: number
    copies?: string[]
}
```

Trie keys by `stream.id`. Stream is the interoperable media object. FotosEntry adds collection-specific metadata.

---

## Batch 1: chat.media — Stream Recipe & Identity

### Task 1.1: Update StreamRecipe.ts

**File**: `/Users/gecko/src/lama/packages/chat.media/src/recipes/StreamRecipe.ts`

Replace generic `metadata` with typed properties:

```typescript
export interface Stream {
    $type$: 'Stream';
    id: string;                              // isId: true — deterministic
    creator: SHA256IdHash<Person>;
    created: number;
    mimeType: string;
    status: StreamStatus;
    exif?: Record<string, unknown>;          // EXIF metadata
    xmp?: Record<string, unknown>;           // XMP metadata
    iptc?: Record<string, unknown>;          // IPTC metadata
}
```

Recipe rules: replace the single `metadata` rule with three optional `stringifiable` rules for `exif`, `xmp`, `iptc`.

**Verify**: `cd packages/chat.media && npm run build`

### Task 1.2: Update StreamWriterDeps — replace generateId with computeId

**File**: `/Users/gecko/src/lama/packages/chat.media/src/services/StreamWriter.ts`

Replace:
```typescript
generateId: () => string;
```

With:
```typescript
computeId: (context: StreamIdContext) => string;
```

Add new type:
```typescript
export interface StreamIdContext {
    creator: SHA256IdHash<Person>;
    created: number;
    mimeType: string;
    contentHash?: string;   // fallback: hash of media data
    exifDate?: string;      // from EXIF DateTimeOriginal
}
```

### Task 1.3: Update StreamWriterOptions — typed metadata

**File**: `/Users/gecko/src/lama/packages/chat.media/src/services/StreamWriter.ts`

Replace:
```typescript
export interface StreamWriterOptions {
    creator: SHA256IdHash<Person>;
    mimeType: string;
    metadata?: Record<string, unknown>;
}
```

With:
```typescript
export interface StreamWriterOptions {
    creator: SHA256IdHash<Person>;
    mimeType: string;
    contentHash?: string;    // for deterministic ID when no rich metadata
    exif?: Record<string, unknown>;
    xmp?: Record<string, unknown>;
    iptc?: Record<string, unknown>;
}
```

### Task 1.4: Update StreamWriter.start() — use computeId

**File**: `/Users/gecko/src/lama/packages/chat.media/src/services/StreamWriter.ts`

In `start()`, replace:
```typescript
id: this.deps.generateId(),
```

With:
```typescript
id: this.deps.computeId({
    creator: this.options.creator,
    created,
    mimeType: this.options.mimeType,
    contentHash: this.options.contentHash,
    exifDate: typeof this.options.exif?.date === 'string'
        ? this.options.exif.date : undefined,
}),
```

And replace:
```typescript
metadata: this.options.metadata
```

With:
```typescript
exif: this.options.exif,
xmp: this.options.xmp,
iptc: this.options.iptc,
```

### Task 1.5: Update index.ts exports

**File**: `/Users/gecko/src/lama/packages/chat.media/src/index.ts`

Add `StreamIdContext` to the exports from services.

**Verify**: `cd packages/chat.media && npm run build`

---

## Batch 2: lama.headless — Consumer Updates

### Task 2.1: Update getStreamWriterDeps in server.ts

**File**: `/Users/gecko/src/lama/packages/lama.headless/src/server.ts` (lines ~1691-1709)

Replace:
```typescript
generateId: () => crypto.randomUUID(),
```

With:
```typescript
computeId: (context) => {
    // Deterministic: hash creator + created + mimeType
    const input = `${context.creator}:${context.created}:${context.mimeType}`;
    return createHash('sha256').update(input).digest('hex');
},
```

Import `createHash` from `node:crypto`.

### Task 2.2: Update createImageStream.ts

**File**: `/Users/gecko/src/lama/packages/lama.headless/src/media/createImageStream.ts`

Update `CreateImageStreamOptions`:
```typescript
export interface CreateImageStreamOptions {
    creator: SHA256IdHash<Person>;
    contentHash?: string;     // hash of image data for deterministic ID
    prompt?: string;
    width?: number;
    height?: number;
}
```

Update `createImageStream()`:
```typescript
const writer = new StreamWriter(deps, {
    creator: options.creator,
    mimeType: 'image/png',
    contentHash: options.contentHash,
    exif: {
        prompt: options.prompt,
        width: options.width,
        height: options.height,
        generatedAt: Date.now()
    }
});
```

### Task 2.3: Update ai-handlers.ts callsites

**File**: `/Users/gecko/src/lama/packages/lama.headless/src/handlers/ai-handlers.ts`

At each `createImageStream` call, compute contentHash from the image data and pass it:
```typescript
const contentHash = createHash('sha256').update(imageData).digest('hex');
const stream = await this.deps.createImageStream(imageData, {
    creator: aiPersonId,
    contentHash,
    prompt: description,
    width: 1024,
    height: 1024
}, this.deps.getStreamWriterDeps());
```

### Task 2.4: Update misc-handlers.ts getStreamData

**File**: `/Users/gecko/src/lama/packages/lama.headless/src/handlers/misc-handlers.ts`

Replace `stream.metadata` access with `stream.exif`:
```typescript
return {
    success: true,
    data: {
        base64,
        mimeType: stream.mimeType,
        exif: stream.exif,
    },
};
```

**Verify**: `cd packages/lama.headless && npm run build`

---

## Batch 3: one.fotos — Stream-Based Media Model

### Task 3.1: Add chat.media dependency

**File**: `/Users/gecko/src/lama/packages/one.fotos/package.json`

Add to dependencies:
```json
"@refinio/chat.media": "workspace:*"
```

Run: `cd packages/one.fotos && npm install`

Note: one.fotos uses npm, not pnpm. Check if workspace protocol works or use relative path.

### Task 3.2: Update types.ts — FotosEntry wraps Stream

**File**: `/Users/gecko/src/lama/packages/one.fotos/src/types.ts`

Replace PhotoEntry with FotosEntry:
```typescript
import type { Stream } from '@refinio/chat.media';

/**
 * A media entry in the fotos catalog.
 * The Stream is the interoperable media object.
 * FotosEntry adds collection-specific metadata.
 */
export interface FotosEntry {
    /** The media stream (identity, content, metadata) */
    stream: Stream;
    /** Original filename */
    name: string;
    /** How this entry is managed in the collection */
    managed: 'reference' | 'metadata' | 'ingested';
    /** Path to original file (for reference/metadata mode) */
    sourcePath?: string;
    /** Relative path to thumbnail */
    thumb?: string;
    /** Tags/labels */
    tags: string[];
    /** File size in bytes */
    size: number;
    /** Redundancy: which devices have a copy */
    copies?: string[];
}
```

Keep ExifData interface (used by exif.ts extraction, then stored on Stream.exif).

Update ResolvedPhotoEntry → not needed anymore (exif is on Stream).

Update Catalog v1 to use FotosEntry for viewer compatibility.

### Task 3.3: Update hash.ts — add computeStreamId

**File**: `/Users/gecko/src/lama/packages/one.fotos/src/hash.ts`

Add:
```typescript
/**
 * Compute deterministic Stream ID from available context.
 *
 * Priority:
 * 1. EXIF date + creator + mimeType (rich metadata)
 * 2. creator + created + mimeType (recording context)
 * 3. contentHash (content-addressed fallback)
 */
export async function computeStreamId(context: {
    creator?: string;
    created?: number;
    mimeType: string;
    contentHash?: string;
    exifDate?: string;
}): Promise<string> {
    if (context.creator && context.exifDate) {
        return createCryptoHash(`${context.creator}:${context.exifDate}:${context.mimeType}`);
    }
    if (context.creator && context.created) {
        return createCryptoHash(`${context.creator}:${context.created}:${context.mimeType}`);
    }
    if (context.contentHash) {
        return context.contentHash;
    }
    throw new Error('Cannot compute stream identity: no metadata or content hash');
}
```

Remove `hashExif` (no longer needed — exif lives on Stream, versioned with the object).

### Task 3.4: Update fotos-trie.ts — store FotosEntry

**File**: `/Users/gecko/src/lama/packages/one.fotos/src/fotos-trie.ts`

- Change `entries` map: `Map<string, FotosEntry>` (keyed by stream.id)
- Remove `exifStore` (exif is on the Stream object)
- `insert(entry: FotosEntry)`: use `entry.stream.id` as hash, read date from `entry.stream.exif?.date`
- `resolveExif` → not needed, access `entry.stream.exif` directly
- Update `serialize/fromSnapshot` — snapshot stores FotosEntry objects
- Update `FotosTrieSnapshot` — remove `exif` field

### Task 3.5: Update catalog.ts — produce Streams

**File**: `/Users/gecko/src/lama/packages/one.fotos/src/catalog.ts`

In `addPhoto()`:
- Hash the file → contentHash (stable, JPEG metadata stripped)
- Extract EXIF → becomes `stream.exif`
- Detect mimeType from file extension or magic bytes
- Compute stream ID via `computeStreamId()`
- Create Stream object with `$type$: 'Stream'`, computed id, exif, mimeType, status: 'finalized'
- Create FotosEntry wrapping the Stream
- Insert into trie

For `creator`: use `config.deviceName` as creator string (no Person objects in standalone fotos).

v1 migration: convert each old PhotoEntry → FotosEntry with Stream.

### Task 3.6: Update cli.ts — use FotosEntry

**File**: `/Users/gecko/src/lama/packages/one.fotos/src/cli.ts`

- `add` command: access `result.entry.stream.exif?.date` for display
- `list` command: access `entry.stream.exif?.date`, use `entry.stream.id` for hash display
- `view` command: pass FotosEntry to viewer (viewer reads stream.exif directly)
- `json` command: serialize with exif inline from stream
- `status` command: iterate FotosEntry

### Task 3.7: Update viewer.ts — read from Stream

**File**: `/Users/gecko/src/lama/packages/one.fotos/src/viewer.ts`

Update `photoToMarkup()` to accept FotosEntry:
- `data-hash` → `entry.stream.id`
- Exif from `entry.stream.exif`
- Name from `entry.name`
- Tags from `entry.tags`

The embedded JS reader stays the same (reads from DOM data attributes).

### Task 3.8: Update export.ts

**File**: `/Users/gecko/src/lama/packages/one.fotos/src/export.ts`

- Use FotosEntry instead of PhotoEntry
- Blob path from `entry.stream.id`
- Exif from `entry.stream.exif`

**Verify**: `cd packages/one.fotos && npm run build && npm test`

---

## Batch 4: Build & Integration Verification

### Task 4.1: Build chat.media
```bash
cd packages/chat.media && npm run build
```

### Task 4.2: Build lama.headless
```bash
cd packages/lama.headless && npm run build
```

### Task 4.3: Build one.fotos
```bash
cd packages/one.fotos && npm run build
```

### Task 4.4: Run one.fotos tests
```bash
cd packages/one.fotos && npm test
```

### Task 4.5: Verify existing catalog migration
Test with a v1 or v2 catalog.json to confirm migration to Stream-based FotosEntry works.

---

## Batch 0: one.fotos — Owner Identity

Every fotos collection has an owner. No anonymous collections.

### Task 0.1: Add owner to FotosConfig

**File**: `/Users/gecko/src/lama/packages/one.fotos/src/types.ts`

```typescript
export interface FotosConfig {
    blobDir: string;
    thumbDir: string;
    thumbSize: number;
    deviceName: string;
    /** Collection owner — used as Stream.creator */
    owner: string;
}
```

Remove `owner` from `DEFAULT_CONFIG` — it must be set explicitly.

### Task 0.2: Require owner on `fotos init`

**File**: `/Users/gecko/src/lama/packages/one.fotos/src/cli.ts`

```
fotos init --owner "Betti" --device "scanner"
```

`--owner` is required. Stored in `fotos.json`. Used as `Stream.creator` for all media added to this collection.

If `fotos add` is called without a configured owner, throw: `"No owner configured. Run 'fotos init --owner <name>' first."`

### Task 0.3: Compute creator from owner

**File**: `/Users/gecko/src/lama/packages/one.fotos/src/hash.ts`

```typescript
/**
 * Derive a stable creator hash from owner name.
 * Deterministic: same owner name = same creator identity.
 * Compatible with SHA256IdHash<Person> when joining ONE.core network later.
 */
export async function ownerToCreator(owner: string): Promise<string> {
    return createCryptoHash(owner);
}
```

This becomes `Stream.creator`. When the collection later joins a ONE.core network, the owner can be mapped to a real Person idHash.

---

## Risk Notes

- **one.fotos uses npm, not pnpm**: The `workspace:*` protocol may not work. May need to use a relative file path dependency or build chat.media first.
- **Stream.creator type**: Stream expects `SHA256IdHash<Person>`. one.fotos derives a synthetic idHash from the owner name via `ownerToCreator()`. This is deterministic and becomes a real Person reference if the collection later joins ONE.core.
- **lama.ui**: Listed as chat.media consumer but exploration found no actual Stream usage. No changes needed.
- **MediaChunk**: one.fotos doesn't use MediaChunk (photos are single files, not chunked streams). The blob is stored directly in the filesystem. MediaChunk is only relevant for chat.media's StreamWriter flow.
