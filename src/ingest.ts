/**
 * Filesystem-based media ingestion.
 *
 * Walks a directory tree using sync.core's scanner, enriches file entries
 * with media metadata (EXIF, thumbnails, content hashes, stream IDs),
 * and writes .one/index.html per directory.
 *
 * Thumbnails are stored in .one/thumbs/ alongside each directory's index.
 * The top-level index.html is the viewer app.
 */

import {scanDirectory, renderFsNodeAsHtml} from '@refinio/sync.core';
import type {FsEntry, FsNode, FsScanResult} from '@refinio/sync.core';
import {
    readdir,
    fileStat,
    readTextFile,
    writeTextFile,
    mkdirp,
    fileExists,
    joinPath
} from '@refinio/one.core/lib/system/filesystem.js';
import {extractExif} from './exif.js';
import {generateThumb} from './thumbs.js';
import {hashFile, computeStreamId, ownerToCreator, mimeFromPath} from './hash.js';
import {initPlatform} from './platform.js';
import {initFaceModels, analyzeImage, facesToDataAttrs, disposeFaceModels} from './faces.js';
import type {ExifData, FotosConfig} from './types.js';

const ONE_DIR = '.one';
const THUMBS_DIR = 'thumbs';
const FACES_DIR = 'faces';
const INDEX_FILE = 'index.html';

function isMediaFile(mime: string): boolean {
    return mime.startsWith('image/') || mime.startsWith('video/');
}

function isImageFile(mime: string): boolean {
    return mime.startsWith('image/');
}

/**
 * Enrich an FsEntry with media metadata.
 * Adds EXIF data, content hash, stream ID, thumbnail path, and optionally face data.
 */
async function enrichEntry(
    entry: FsEntry,
    rootPath: string,
    oneDirPath: string,
    config: FotosConfig,
    runFaces: boolean
): Promise<FsEntry> {
    if (!isMediaFile(entry.mime)) return entry;

    const filePath = joinPath(rootPath, entry.path);
    const data: Record<string, string> = {};

    // Content hash (stable — JPEG strips metadata segments)
    const contentHash = await hashFile(filePath);
    data['content-hash'] = contentHash;

    // EXIF extraction
    const exif = await extractExif(filePath);
    if (exif.date) data['exif-date'] = exif.date;
    if (exif.camera) data['exif-camera'] = exif.camera;
    if (exif.lens) data['exif-lens'] = exif.lens;
    if (exif.focalLength) data['exif-focal'] = exif.focalLength;
    if (exif.aperture) data['exif-aperture'] = exif.aperture;
    if (exif.shutter) data['exif-shutter'] = exif.shutter;
    if (exif.iso) data['exif-iso'] = String(exif.iso);
    if (exif.gps) data['exif-gps'] = `${exif.gps.lat},${exif.gps.lon}`;
    if (exif.width) data['exif-width'] = String(exif.width);
    if (exif.height) data['exif-height'] = String(exif.height);

    // Stream ID (deterministic)
    const creator = await ownerToCreator(config.owner);
    const streamId = await computeStreamId({
        creator,
        exifDate: exif.date,
        mimeType: entry.mime,
        contentHash
    });
    data['stream-id'] = streamId;

    // Thumbnail
    if (isImageFile(entry.mime)) {
        const thumbDir = joinPath(oneDirPath, THUMBS_DIR);
        const thumbRelative = await generateThumb(
            filePath,
            streamId,
            thumbDir,
            config.thumbSize
        );
        data['thumb'] = `${THUMBS_DIR}/${thumbRelative}`;
    }

    // Face detection + recognition
    if (runFaces && isImageFile(entry.mime)) {
        try {
            const facesDir = joinPath(oneDirPath, FACES_DIR);
            const result = await analyzeImage(filePath, facesDir, streamId);
            const faceData = facesToDataAttrs(result);
            Object.assign(data, faceData);
        } catch (err) {
            // Face analysis failure is non-fatal — log and continue
            console.error(`  face analysis failed for ${entry.name}: ${err}`);
        }
    }

    return {
        ...entry,
        contentHash,
        data
    };
}

/**
 * Check if a folder's .one/index.html is stale by comparing
 * the scannedAt timestamp against file mtimes.
 */
async function isFolderStale(dirPath: string, node: FsNode): Promise<boolean> {
    const indexPath = joinPath(dirPath, ONE_DIR, INDEX_FILE);
    if (!await fileExists(indexPath)) return true;

    const html = await readTextFile(indexPath);
    const match = html.match(/data-scanned="([^"]+)"/);
    if (!match) return true;

    const scannedAt = new Date(match[1]).getTime();

    // Any file newer than the last scan?
    for (const entry of node.entries) {
        if (entry.mtime > scannedAt) return true;
    }

    return false;
}

export interface IngestResult extends FsScanResult {
    /** Number of folders that were updated (vs skipped) */
    updated: number;
    /** Number of folders skipped (unchanged) */
    skipped: number;
}

export interface IngestOptions {
    force?: boolean;
    /** Run InsightFace detection + recognition (requires buffalo_l models) */
    faces?: boolean;
    /** Path to InsightFace ONNX model directory (default: ~/.one/models/buffalo_l) */
    modelDir?: string;
}

/**
 * Ingest a directory tree: scan → enrich media entries → write .one/ folders.
 * Incremental: only re-processes folders where files changed since last scan.
 */
export async function ingestMediaDirectory(
    rootPath: string,
    config: FotosConfig,
    options: IngestOptions = {}
): Promise<IngestResult> {
    await initPlatform();

    // Initialize face models if requested
    if (options.faces) {
        const modelDir = options.modelDir ?? joinPath(
            process.env.HOME ?? process.env.USERPROFILE ?? '.',
            '.one', 'models', 'buffalo_l'
        );
        await initFaceModels(modelDir);
    }

    const scanResult = await scanDirectory(rootPath);
    let updated = 0;
    let skipped = 0;

    try {
        for (const [relPath, node] of scanResult.nodes) {
            const dirPath = relPath === '.' ? rootPath : joinPath(rootPath, relPath);
            const oneDirPath = joinPath(dirPath, ONE_DIR);

            // Skip unchanged folders unless forced
            if (!options.force && !await isFolderStale(dirPath, node)) {
                skipped++;
                continue;
            }

            // Enrich media entries
            const enrichedEntries: FsEntry[] = [];
            for (const entry of node.entries) {
                enrichedEntries.push(
                    await enrichEntry(entry, rootPath, oneDirPath, config, !!options.faces)
                );
            }

            const enrichedNode: FsNode = {
                ...node,
                entries: enrichedEntries
            };

            // Write .one/index.html
            await mkdirp(oneDirPath);
            const html = renderFsNodeAsHtml(enrichedNode);
            await writeTextFile(joinPath(oneDirPath, INDEX_FILE), html);

            scanResult.nodes.set(relPath, enrichedNode);
            updated++;
        }
    } finally {
        // Release ONNX sessions
        if (options.faces) {
            await disposeFaceModels();
        }
    }

    const enrichedRoot = scanResult.nodes.get('.')!;

    return {
        root: enrichedRoot,
        nodes: scanResult.nodes,
        updated,
        skipped
    };
}

/**
 * Write the .gitignore for a media collection.
 * Tracks only .one/ folders and the viewer, ignores media blobs.
 */
export async function writeGitignore(rootPath: string): Promise<void> {
    const content = `# Track only .one/ metadata and viewer — ignore media blobs
*
!.gitignore
!index.html
!**/.one/
!**/.one/**
`;
    await writeTextFile(joinPath(rootPath, '.gitignore'), content);
}
