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

one.fotos is a CLI-based media collection manager. It walks a directory tree, enriches media files with EXIF metadata, thumbnails, content hashes, stream IDs, and optional face analysis, then writes `.one/index.html` files per directory using sync.core's filesystem trie format.

### Filesystem Trie (.one/ folders)

The filesystem IS the trie. Each directory gets a `.one/index.html` with `<tr class="fs-entry">` rows carrying `data-*` attributes for all metadata. Thumbnails sit in `.one/thumbs/`. Git tracks only `.one/` folders; media blobs are gitignored.

```
/media/photos/
├── .git/              ← tracks .one/ changes only
├── .gitignore         ← ignores media blobs
├── .one/index.html    ← root trie node
├── 2024-crete/
│   ├── .one/
│   │   ├── index.html ← trie node with data-exif-*, data-thumb, data-face-*, etc.
│   │   └── thumbs/    ← thumbnails for this folder
│   └── IMG_001.jpg    ← gitignored
```

### Data Flow

```
Directory tree → scanDirectory() (sync.core) → FsNode/FsEntry[]
  → enrichEntry() per media file:
      hashFile()         → data-content-hash (stable JPEG hashing)
      extractExif()      → data-exif-date, data-exif-camera, data-exif-gps, ...
      computeStreamId()  → data-stream-id (deterministic, not UUID)
      generateThumb()    → data-thumb (in .one/thumbs/)
      analyzeImage()     → data-face-count, data-face-bboxes, data-face-embeddings (optional)
  → renderFsNodeAsHtml() → .one/index.html
```

### Incremental Ingestion

`isFolderStale()` compares the `data-scanned` timestamp in existing `.one/index.html` against file mtimes. Only folders with newer files are re-processed. Use `--force` to override.

### Stream Identity (deterministic, no UUID)

Stream ID is computed from available context:
1. **Rich metadata**: `hash(creator + exifDate + mimeType)` — "photo taken by X at time Y"
2. **Content hash fallback**: `imageDataHash` — "we know what it is, not where it came from"

Same photo re-imported = same stream ID.

### Stable Image Hashing

For JPEG files, the hash is computed from **image data only** — APPn (EXIF, XMP, JFIF) and COM segments are stripped before hashing. Same photo = same hash regardless of metadata edits.

### Owner Identity

`fotos.json` → `owner` field. The owner name is hashed via `ownerToCreator()` to produce a stable `SHA256IdHash<Person>`-compatible creator identity.

### CLI Commands

- `fotos init --owner <name>` — initialize collection
- `fotos ingest [dir] --owner <name> [--force] [--faces] [--git]` — scan + enrich + write .one/ folders
- `fotos add <files...> [-m reference|metadata|ingest]` — add individual photos to catalog
- `fotos list [-t tag]` — list entries
- `fotos tag/untag <id> <tags...>` — manage tags
- `fotos view` — generate standalone HTML viewer (reads from catalog, not .one/ folders)
- `fotos json` — export catalog as JSON
- `fotos export <dir> [-t tag]` — export self-contained bundle
- `fotos status` — show collection stats

### Key Files

| File | Purpose |
|------|---------|
| `src/ingest.ts` | Directory tree ingestion: scan → enrich → write .one/index.html |
| `src/cli.ts` | Commander-based CLI entry point |
| `src/hash.ts` | Stable image hashing, `computeStreamId`, `ownerToCreator`, `mimeFromPath` |
| `src/exif.ts` | EXIF extraction using `exifreader` |
| `src/thumbs.ts` | Thumbnail generation using `sharp` |
| `src/faces.ts` | Node.js face analysis platform (onnxruntime-node + sharp → fotos.core) |
| `src/catalog.ts` | Legacy catalog CRUD (FotosEntry/Stream model, trie-based) |
| `src/fotos-trie.ts` | FotosTrie: sync + time tries storing FotosEntry objects |
| `src/viewer.ts` | Generates self-contained HTML viewer from catalog |
| `src/export.ts` | Export collection subset as self-contained bundle |
| `src/types.ts` | `FotosEntry`, `Stream`, `ExifData`, `FotosConfig` interfaces |
| `src/platform.ts` | ONE.core platform crypto initialization |

### Two Models Coexist

1. **Filesystem trie** (`ingest.ts`): The current model. Walks directories, writes `.one/index.html` per folder. Used by fotos.browser, fotos.html, and the headless fotos handlers.
2. **Catalog model** (`catalog.ts`): The legacy model. `FotosEntry` wrapping `Stream`, stored in `catalog.json` with `FotosTrie`. Used by `fotos add/list/tag/view/export` commands.

### Dependencies

- **@refinio/sync.core** — `scanDirectory()`, `renderFsNodeAsHtml()`, `FsNode`/`FsEntry` types
- **@refinio/one.core** — crypto hashing, filesystem abstraction, platform init
- **@refinio/fotos.core** — platform-agnostic face analysis (InsightFace buffalo_l)
- **@refinio/chat.media** — Stream type (used by legacy catalog model)
- **@refinio/trie.core** — MultiTrie (used by legacy catalog model)
- **sharp** — thumbnail generation, face crop extraction
- **exifreader** — EXIF metadata extraction
- **onnxruntime-node** — face detection/recognition inference
- **commander** — CLI framework

### Deployment (lama.headless on DGX Spark)

fotos plugs into lama.headless as a FotosPlan — a full ONE.core instance with commserver, CHUM sync, auth, the works. The fotos handlers add:
- `fotos:scan/config/setConfig/ingest/ingestStatus` plan methods
- `GET /fotos/thumb/*` and `GET /fotos/file/*` Express routes
- fotos.html served at `/fotos/` (static files in `html/fotos/`)

Deploy via `packages/lama.headless/deploy-spark.sh`. Container mounts the media directory at `/fotos`.

## Identity Model

One identity, additive trust levels. Email is the identity anchor.

### Trust Levels (additive, nothing lost between transitions)

1. **Ephemeral** — auto-generated email, works immediately, no input needed. Full local functionality + device sync.
2. **Anchored** — user enters real email, identity becomes persistent and exportable (key file or QR). Multiple profiles supported off the same email anchor.
3. **Certified** — refinio counter-signs the existing self-signed cert with a validity period tied to subscription (€10/yr). Groups become available, trust managed by refinio.

### Key Principles

- **Self-signed cert is the real identity** — glue.one certification adds trust via counter-signature, never replaces it
- **Auto cert is never destroyed** — signing in with glue.one layers on top, signing out peels the layer off
- **One Someone, many profiles** — email anchor holds multiple profiles, user manages them
- **No data loss** — transitioning between trust levels preserves all photos, tags, device sync. Groups deactivate without certification but nothing is deleted.

### Sign-in Flow (fotos.one)

- "Sign in with glue.one" button in settings opens `glue.one/auth` popup
- Popup handles both returning users (passkey ceremony) and new users (name registration + first passkey)
- On success, fotos.one receives cert + identity via postMessage
- "Learn more about glue.one →" link opens glue.one info page in new tab

### Group Sharing

- Device sync is the baseline (works without glue.one)
- glue.one groups extend sharing to other people (family, friends, teams)
- Groups show read-only in fotos.one with per-group sharing on/off toggle
- Group management happens on glue.one
- No direct publish-to-feed from fotos.one — users go to glue.one to share to their feed (deliberate friction to protect privacy)
