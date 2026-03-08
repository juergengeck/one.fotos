#!/usr/bin/env node

import {Command} from 'commander';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {
    addPhoto,
    loadCatalog,
    loadConfig,
    saveConfig,
    tagPhotos,
    untagPhotos,
    filterPhotos,
    allTags
} from './catalog.js';
import {generateViewer} from './viewer.js';
import {exportCollection} from './export.js';
import {ingestMediaDirectory, writeGitignore} from './ingest.js';
import type {AddMode} from './catalog.js';
import type {FotosConfig, ExifData} from './types.js';
import {DEFAULT_CONFIG} from './types.js';

const program = new Command();

program
    .name('fotos')
    .description('Git-based photo collection manager')
    .version('0.1.0');

program
    .command('init')
    .description('Initialize a new photo collection in the current directory')
    .option('--name <name>', 'Collection name')
    .option('--device <device>', 'This device name', 'default')
    .requiredOption('--owner <owner>', 'Collection owner (required)')
    .action(async (opts) => {
        const dir = process.cwd();
        const config: FotosConfig = {...DEFAULT_CONFIG, owner: opts.owner, deviceName: opts.device};
        await saveConfig(dir, config);

        const catalog = await loadCatalog(dir);
        if (opts.name) catalog.name = opts.name;
        const {saveCatalog} = await import('./catalog.js');
        await saveCatalog(dir, catalog);

        console.log(`Initialized photo collection: ${catalog.name}`);
        console.log(`  Owner:  ${config.owner}`);
        console.log(`  Device: ${config.deviceName}`);
        console.log(`  Blobs:  ${config.blobDir}/`);
        console.log(`  Thumbs: ${config.thumbDir}/`);
    });

program
    .command('add <files...>')
    .description('Add photos to the collection')
    .option('-m, --mode <mode>', 'reference | metadata | ingest', 'metadata')
    .action(async (files: string[], opts) => {
        const dir = process.cwd();
        const mode = opts.mode as AddMode;

        for (const file of files) {
            const filePath = resolve(file);
            try {
                const {entry, exif} = await addPhoto(dir, filePath, mode);
                const id = entry.stream.id.slice(0, 8);
                const exifDate = exif?.date ?? '';
                console.log(
                    `  ${id}  ${entry.name}  [${entry.managed}]${exifDate ? '  ' + exifDate : ''}`
                );
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error(`  SKIP  ${file}: ${msg}`);
            }
        }
    });

program
    .command('tag <id> <tags...>')
    .description('Add tags to entries matching ID prefix')
    .action(async (id: string, tags: string[]) => {
        const dir = process.cwd();
        const updated = await tagPhotos(dir, id, tags);
        for (const e of updated) {
            console.log(`  ${e.stream.id.slice(0, 8)}  ${e.name}  [${e.tags.join(', ')}]`);
        }
    });

program
    .command('untag <id> <tags...>')
    .description('Remove tags from entries matching ID prefix')
    .action(async (id: string, tags: string[]) => {
        const dir = process.cwd();
        const updated = await untagPhotos(dir, id, tags);
        for (const e of updated) {
            console.log(`  ${e.stream.id.slice(0, 8)}  ${e.name}  [${e.tags.join(', ')}]`);
        }
    });

program
    .command('list')
    .description('List entries in the collection')
    .option('-t, --tag <tag>', 'Filter by tag')
    .action(async (opts) => {
        const dir = process.cwd();
        const catalog = await loadCatalog(dir);
        const entries = filterPhotos(catalog, opts.tag);

        if (entries.length === 0) {
            console.log('No entries found.');
            return;
        }

        for (const e of entries) {
            const tags = e.tags.length ? `  [${e.tags.join(', ')}]` : '';
            const exif = e.stream.exif as ExifData | undefined;
            const date = exif?.date ? `  ${exif.date}` : '';
            const mode = e.managed[0].toUpperCase();
            const size = (e.size / 1024 / 1024).toFixed(1) + 'MB';
            console.log(
                `  ${e.stream.id.slice(0, 8)}  ${mode}  ${size.padStart(7)}  ${e.name}${date}${tags}`
            );
        }

        console.log(`\n${entries.length} entries`);
    });

program
    .command('tags')
    .description('List all tags with counts')
    .action(async () => {
        const dir = process.cwd();
        const catalog = await loadCatalog(dir);
        const tags = allTags(catalog);

        if (tags.size === 0) {
            console.log('No tags.');
            return;
        }

        const sorted = [...tags.entries()].sort((a, b) => b[1] - a[1]);
        for (const [tag, count] of sorted) {
            console.log(`  ${count.toString().padStart(4)}  ${tag}`);
        }
    });

program
    .command('view')
    .description('Generate the HTML document (markup IS the catalog)')
    .option('-o, --output <file>', 'Output file', 'index.html')
    .action(async (opts) => {
        const dir = process.cwd();
        const catalog = await loadCatalog(dir);
        const entries = catalog.trie.allEntries();
        const v1ForViewer = {
            ...catalog,
            version: 1 as const,
            photos: entries.map(e => ({
                ...e,
                exif: e.stream.exif as ExifData | undefined,
            })),
        };
        const html = generateViewer(v1ForViewer);
        await writeFile(resolve(dir, opts.output), html);
        console.log(`Written to ${opts.output} (${entries.length} entries, HTML-native format)`);
    });

program
    .command('json')
    .description('Export catalog as JSON (derived from native HTML format)')
    .option('-o, --output <file>', 'Output file', 'catalog.json')
    .action(async (opts) => {
        const dir = process.cwd();
        const catalog = await loadCatalog(dir);
        const entries = catalog.trie.allEntries().map(e => ({
            ...e,
            exif: e.stream.exif as ExifData | undefined,
        }));
        const jsonCatalog = {version: 1, name: catalog.name, created: catalog.created, device: catalog.device, photos: entries};
        await writeFile(resolve(dir, opts.output), JSON.stringify(jsonCatalog, null, 2) + '\n');
        console.log(`JSON export: ${opts.output} (${entries.length} entries)`);
    });

program
    .command('export <targetDir>')
    .description('Export collection (or tag subset) as self-contained bundle')
    .option('-t, --tag <tag>', 'Export only entries with this tag')
    .option('--originals', 'Include original photos (not just thumbs)', false)
    .action(async (targetDir: string, opts) => {
        const dir = process.cwd();
        const target = resolve(targetDir);
        const result = await exportCollection(dir, target, {
            tag: opts.tag,
            includeOriginals: opts.originals
        });
        console.log(`Exported ${result.exported} entries to ${target}`);
    });

program
    .command('status')
    .description('Show collection status')
    .action(async () => {
        const dir = process.cwd();
        const catalog = await loadCatalog(dir);
        const config = await loadConfig(dir);
        const tags = allTags(catalog);

        const entries = catalog.trie.allEntries();
        const totalSize = entries.reduce((s, e) => s + e.size, 0);
        const ingested = entries.filter(e => e.managed === 'ingested').length;
        const metadata = entries.filter(e => e.managed === 'metadata').length;
        const reference = entries.filter(e => e.managed === 'reference').length;

        console.log(`Collection: ${catalog.name}`);
        console.log(`Owner:      ${config.owner || '(not set)'}`);
        console.log(`Device:     ${config.deviceName}`);
        console.log(`Entries:    ${entries.length}`);
        console.log(`  Ingested:   ${ingested}`);
        console.log(`  Metadata:   ${metadata}`);
        console.log(`  Reference:  ${reference}`);
        console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB (originals)`);
        console.log(`Tags:       ${tags.size}`);

        if (tags.size > 0) {
            const top = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
            console.log(`  Top:      ${top.map(([t, n]) => `${t}(${n})`).join(', ')}`);
        }
    });

program
    .command('ingest [dir]')
    .description('Scan directory tree, extract metadata, generate thumbnails, write .one/ folders')
    .option('--owner <owner>', 'Collection owner')
    .option('--device <device>', 'Device name', 'default')
    .option('--force', 'Re-process all folders even if unchanged', false)
    .option('--faces', 'Run InsightFace detection + recognition', false)
    .option('--model-dir <path>', 'InsightFace ONNX model directory')
    .option('--git', 'Write .gitignore (tracks only .one/ folders)', false)
    .action(async (dir: string | undefined, opts) => {
        const targetDir = dir ? resolve(dir) : process.cwd();
        const config = await loadConfig(targetDir);

        if (opts.owner) config.owner = opts.owner;
        if (opts.device) config.deviceName = opts.device;

        if (!config.owner) {
            console.error("No owner configured. Use --owner <name> or run 'fotos init' first.");
            process.exit(1);
        }

        await saveConfig(targetDir, config);

        console.log(`Ingesting ${targetDir}...`);
        if (opts.faces) console.log('  Face detection + recognition enabled');
        const result = await ingestMediaDirectory(targetDir, config, {
            force: opts.force,
            faces: opts.faces,
            modelDir: opts.modelDir,
        });

        let mediaCount = 0;
        for (const node of result.nodes.values()) {
            const media = node.entries.filter(e =>
                e.mime.startsWith('image/') || e.mime.startsWith('video/')
            );
            mediaCount += media.length;
        }

        console.log(`  ${result.nodes.size} directories scanned`);
        console.log(`  ${result.updated} updated, ${result.skipped} unchanged`);
        console.log(`  ${mediaCount} media files`);

        if (opts.git) {
            await writeGitignore(targetDir);
            console.log(`  .gitignore written`);
        }
    });

program.parse();
