#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
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
import { generateViewer } from './viewer.js';
import { exportCollection } from './export.js';
import type { AddMode } from './catalog.js';
import { DEFAULT_CONFIG } from './types.js';

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
    .action(async (opts) => {
        const dir = process.cwd();
        const config = { ...DEFAULT_CONFIG, deviceName: opts.device };
        await saveConfig(dir, config);

        const catalog = await loadCatalog(dir);
        if (opts.name) catalog.name = opts.name;
        const { saveCatalog } = await import('./catalog.js');
        await saveCatalog(dir, catalog);

        console.log(`Initialized photo collection: ${catalog.name}`);
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
                const entry = await addPhoto(dir, filePath, mode);
                const hash = entry.hash.slice(0, 8);
                const exifDate = entry.exif?.date ?? '';
                console.log(
                    `  ${hash}  ${entry.name}  [${entry.managed}]${exifDate ? '  ' + exifDate : ''}`
                );
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error(`  SKIP  ${file}: ${msg}`);
            }
        }
    });

program
    .command('tag <hash> <tags...>')
    .description('Add tags to photos matching hash prefix')
    .action(async (hash: string, tags: string[]) => {
        const dir = process.cwd();
        const updated = await tagPhotos(dir, hash, tags);
        for (const p of updated) {
            console.log(`  ${p.hash.slice(0, 8)}  ${p.name}  [${p.tags.join(', ')}]`);
        }
    });

program
    .command('untag <hash> <tags...>')
    .description('Remove tags from photos matching hash prefix')
    .action(async (hash: string, tags: string[]) => {
        const dir = process.cwd();
        const updated = await untagPhotos(dir, hash, tags);
        for (const p of updated) {
            console.log(`  ${p.hash.slice(0, 8)}  ${p.name}  [${p.tags.join(', ')}]`);
        }
    });

program
    .command('list')
    .description('List photos in the collection')
    .option('-t, --tag <tag>', 'Filter by tag')
    .action(async (opts) => {
        const dir = process.cwd();
        const catalog = await loadCatalog(dir);
        const photos = filterPhotos(catalog, opts.tag);

        if (photos.length === 0) {
            console.log('No photos found.');
            return;
        }

        for (const p of photos) {
            const tags = p.tags.length ? `  [${p.tags.join(', ')}]` : '';
            const date = p.exif?.date ? `  ${p.exif.date}` : '';
            const mode = p.managed[0].toUpperCase();
            const size = (p.size / 1024 / 1024).toFixed(1) + 'MB';
            console.log(
                `  ${p.hash.slice(0, 8)}  ${mode}  ${size.padStart(7)}  ${p.name}${date}${tags}`
            );
        }

        console.log(`\n${photos.length} photos`);
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
    .description('Generate the HTML viewer')
    .option('-o, --output <file>', 'Output file', 'index.html')
    .action(async (opts) => {
        const dir = process.cwd();
        const catalog = await loadCatalog(dir);
        const html = generateViewer(catalog);
        await writeFile(resolve(dir, opts.output), html);
        console.log(`Viewer written to ${opts.output} (${catalog.photos.length} photos)`);
    });

program
    .command('export <targetDir>')
    .description('Export collection (or tag subset) as self-contained bundle')
    .option('-t, --tag <tag>', 'Export only photos with this tag')
    .option('--originals', 'Include original photos (not just thumbs)', false)
    .action(async (targetDir: string, opts) => {
        const dir = process.cwd();
        const target = resolve(targetDir);
        const result = await exportCollection(dir, target, {
            tag: opts.tag,
            includeOriginals: opts.originals
        });
        console.log(`Exported ${result.exported} photos to ${target}`);
    });

program
    .command('status')
    .description('Show collection status')
    .action(async () => {
        const dir = process.cwd();
        const catalog = await loadCatalog(dir);
        const config = await loadConfig(dir);
        const tags = allTags(catalog);

        const totalSize = catalog.photos.reduce((s, p) => s + p.size, 0);
        const ingested = catalog.photos.filter(p => p.managed === 'ingested').length;
        const metadata = catalog.photos.filter(p => p.managed === 'metadata').length;
        const reference = catalog.photos.filter(p => p.managed === 'reference').length;

        console.log(`Collection: ${catalog.name}`);
        console.log(`Device:     ${config.deviceName}`);
        console.log(`Photos:     ${catalog.photos.length}`);
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

program.parse();
