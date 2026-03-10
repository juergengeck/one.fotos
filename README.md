# one.fotos

Filesystem-native photo collection manager. The filesystem IS the data structure — each directory gets a `.one/` folder with metadata, thumbnails, face embeddings, and a styled HTML index. Git tracks the metadata, not the blobs.

## How it works

```
/media/photos/
├── .git/                    ← tracks only .one/ folders
├── .gitignore               ← ignores media blobs
├── .one/
│   └── index.html           ← root trie node (directory listing)
├── 2024-crete/
│   ├── .one/
│   │   ├── index.html       ← enriched: EXIF, face data, stream IDs
│   │   ├── thumbs/          ← thumbnails
│   │   └── faces/           ← face crops + embeddings
│   ├── IMG_001.jpg           ← gitignored
│   └── IMG_002.jpg
└── 2024-birthday/
    ├── .one/
    │   ├── index.html
    │   ├── thumbs/
    │   └── faces/
    └── video.mp4
```

Each `.one/index.html` is both:
- **Human-readable**: open in a browser, styled directory listing with thumbnails
- **Machine-parseable**: `data-*` attributes carry EXIF, hashes, face embeddings, stream IDs

Copy a folder to a thumbdrive → `.one/` travels with it, metadata intact. No database, no server.

## Quick start

```bash
# Install
cd packages/one.fotos && npm install

# Ingest a photo directory
fotos ingest /path/to/photos --owner "Alice"

# With git tracking and face detection
fotos ingest /path/to/photos --owner "Alice" --git --faces

# Re-run — only processes changed folders
fotos ingest /path/to/photos --owner "Alice"

# Force re-process everything
fotos ingest /path/to/photos --owner "Alice" --force
```

## Commands

| Command | Description |
|---------|-------------|
| `fotos init --owner <name>` | Initialize collection config |
| `fotos ingest [dir]` | Scan → EXIF → thumbs → faces → write `.one/` folders |
| `fotos add <files...>` | Add individual photos to catalog |
| `fotos tag <id> <tags...>` | Tag entries by stream ID prefix |
| `fotos untag <id> <tags...>` | Remove tags |
| `fotos list [-t tag]` | List entries, optionally filtered |
| `fotos tags` | List all tags with counts |
| `fotos view` | Generate HTML viewer |
| `fotos export <dir>` | Export collection subset as bundle |
| `fotos status` | Collection stats |

### Ingest options

```
fotos ingest [dir] [options]

Options:
  --owner <name>    Collection owner (required on first run)
  --device <name>   Device name (default: "default")
  --force           Re-process all folders even if unchanged
  --faces           Run InsightFace detection + recognition
  --git             Write .gitignore (tracks only .one/ folders)
```

## Architecture

### Stream-based media model

Every media entry is a **Stream** — the same interoperable type used across the lama ecosystem. A photo is a finalized single-chunk Stream with a deterministic content-addressed ID.

### Identity hashing

- **JPEG**: hash computed from image data only (APPn/EXIF segments stripped). Same photo = same hash regardless of metadata edits.
- **Stream ID**: `hash(creator + exifDate + mimeType)` when EXIF is available, falls back to content hash.
- **Owner → Creator**: owner name hashed to `SHA256IdHash<Person>` for ONE.core compatibility.

### Filesystem trie (sync.core)

The directory tree is modeled as a trie via `@refinio/sync.core`:
- `FsEntry` — file leaf with extensible `data` map (rendered as `data-*` attributes)
- `FsNode` — directory node with entries, children, aggregate stats
- Scanner walks the tree, renderer produces styled HTML
- Incremental: `scannedAt` timestamp vs file `mtime` for dirty detection

### Face analysis (InsightFace buffalo_l)

On `fotos ingest --faces`, each image is processed through InsightFace's buffalo_l ONNX model pack:

| Model | File | Purpose | Output |
|-------|------|---------|--------|
| RetinaFace | `det_10g.onnx` | Face detection | Bounding boxes + landmarks |
| ArcFace | `w600k_r50.onnx` | Face recognition | 512-dim embedding vectors |

Results stored in `.one/`:
- `faces/` — cropped face thumbnails
- `index.html` — `data-faces` attribute with detection count, `data-face-embeddings` with base64-encoded 512-dim float32 vectors

Face embeddings enable:
- **Clustering**: group by person across folders
- **Search**: find all photos of a specific person
- **Deduplication**: same face = same cluster regardless of angle/lighting

### Browser app ([fotos.one](https://fotos.one))

React 19 + Vite app that runs entirely client-side — no server, no upload.

**Desktop** (Chrome/Edge/Arc): uses File System Access API with `readwrite` mode.
1. User clicks "attach photo library" → `showDirectoryPicker()`
2. If no `.one/` metadata found, **auto-ingests**: EXIF extraction via `exifreader`, thumbnails via `OffscreenCanvas`, content hashes via `crypto.subtle`, writes `.one/index.html` per directory
3. If `.one/` already exists (from CLI or previous browser session), reads it directly
4. Full gallery with day groups, tag filtering, search, lightbox, timeline scrubber

**Mobile** (iOS Safari, Android Chrome): uses `<input type="file" webkitdirectory>` fallback.
- Reads images via file input, processes EXIF and thumbnails in-memory
- No `.one/` write (read-only) — gallery displayed from object URLs
- Service worker enables offline access after first load

The browser ingestion produces the same `.one/` format as the CLI — interoperable across platforms.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@refinio/sync.core` | Filesystem trie (scanner, renderer, ingest) |
| `@refinio/one.core` | Platform abstraction, crypto hashing |
| `@refinio/chat.media` | Stream type (interoperable media) |
| `sharp` | Thumbnail generation |
| `exifreader` | EXIF metadata extraction |
| `onnxruntime-node` | InsightFace ONNX inference (Node.js) |
| `commander` | CLI framework |

## Storage modes

Each entry has one of three management levels:
- **reference**: pointer to original file, no copies
- **metadata**: reference + EXIF + thumbnail + face data (default for ingest)
- **ingested**: full copy into content-addressed blob store

## Git integration

`.gitignore` tracks only `.one/` folders:
```
*
!.gitignore
!index.html
!**/.one/
!**/.one/**
```

Plug in a drive → run `fotos ingest` → `git diff` shows what's new, changed, or missing. The hash-based identity means deduplication across drives is free.
