# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Build (TypeScript to dist/)
npm run build        # tsc

# Watch mode
npm run dev          # tsc --watch

# Run tests
npm test             # vitest run

# Run CLI
node dist/cli.js <command>
# or after npm link:
fotos <command>
```

## Architecture

one.fotos is a CLI-based media collection manager built on chat.media's Stream type. Every media entry is a **Stream** — the same interoperable type used across the lama ecosystem (chat attachments, IMAP adapters, etc.). A photo is a finalized single-chunk Stream.

### Core Model: FotosEntry wraps Stream

```
FotosEntry {
    stream: Stream          // The media object (identity, content type, metadata)
    name: string            // Original filename
    managed: 'reference' | 'metadata' | 'ingested'
    sourcePath?: string     // Original file location
    thumb?: string          // Thumbnail path
    tags: string[]          // Labels
    size: number            // File size
    copies?: string[]       // Which devices have a copy
}
```

**Stream** (from `@refinio/chat.media`) carries:
- `id` — deterministic content-addressed identity (not UUID)
- `creator` — who added this media (derived from collection owner)
- `created` — unix timestamp
- `mimeType` — e.g. `image/jpeg`
- `status` — always `finalized` for imported media
- `exif?`, `xmp?`, `iptc?` — metadata as top-level versioned properties

### Stream Identity (deterministic, no UUID)

Stream.id is computed from available context, not random:

1. **Rich metadata**: `hash(creator + exifDate + mimeType)` — "photo taken by X at time Y"
2. **Content hash fallback**: `imageDataHash` — "we know what it is, not where it came from"

Same photo re-imported = same stream ID. Metadata changes = new version of same stream (id stays, content hash changes).

### Stable Image Hashing

For JPEG files, the hash is computed from **image data only** — APPn (EXIF, XMP, JFIF) and COM segments are stripped before hashing. This means the same photo produces the same hash regardless of metadata edits or re-exports by different tools.

### Owner Identity

Every collection has an owner (`fotos.json` → `owner` field). The owner name is hashed to produce a stable creator identity compatible with `SHA256IdHash<Person>` — if the collection later joins a ONE.core network, the owner maps to a real Person.

```bash
fotos init --owner "Betti" --device "scanner"
```

### Data Flow

```
Image files → addPhoto() → Stream + FotosEntry → catalog.json + thumbs/ + blobs/
catalog.json → generateViewer() → index.html (self-contained)
```

### HTML-Native Format

The HTML viewer is the **primary format** — entries are semantic `<article class="foto">` elements with data attributes. The embedded JS reads from the DOM, not from JSON. JSON (`catalog.json`) is a derived export format. The `domToCatalog()` function in the viewer can reconstruct JSON from the HTML DOM.

### Storage Modes (AddMode)

Each entry has one of three management levels:
- **reference**: Just a pointer to the original file path, no copies
- **metadata**: Reference + EXIF extraction + thumbnail generation (default)
- **ingest**: Full copy into content-addressed blob store (`blobs/XX/XXXX...`)

### Trie-Based Storage & Sync

The catalog uses a `FotosTrie` (from `@refinio/trie.core`) with two internal tries:
- **sync trie**: Hash-prefix keyed — Merkle tree for efficient diff/sync between devices
- **time trie**: Date-path keyed — fast date-range queries

### Key Files

| File | Purpose |
|------|---------|
| `src/types.ts` | `FotosEntry`, `Stream`, `ExifData`, `FotosConfig` interfaces |
| `src/catalog.ts` | Catalog CRUD: add, tag, untag, filter, load/save, v1 migration |
| `src/fotos-trie.ts` | FotosTrie: sync + time tries storing FotosEntry objects |
| `src/hash.ts` | Stable image hashing, `computeStreamId`, `ownerToCreator`, `mimeFromPath` |
| `src/exif.ts` | EXIF extraction using `exifreader` |
| `src/thumbs.ts` | Thumbnail generation using `sharp` |
| `src/viewer.ts` | Generates self-contained HTML with embedded CSS/JS |
| `src/export.ts` | Export collection subset as self-contained bundle |
| `src/cli.ts` | Commander-based CLI entry point |
| `src/platform.ts` | ONE.core platform crypto initialization |

### Config Files

- `fotos.json` — per-collection config (owner, deviceName, blobDir, thumbDir, thumbSize)
- `catalog.json` — the photo catalog (v2 with trie snapshot)

### Dependencies

- **@refinio/chat.media** — Stream type (interoperable media object)
- **@refinio/one.core** — crypto hashing, platform helpers
- **@refinio/trie.core** — MultiTrie for sync + time indexing
- **sharp** — thumbnail generation
- **exifreader** — EXIF metadata extraction
- **commander** — CLI framework
