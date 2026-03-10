import type { Catalog, FotosEntry, ExifData } from './types.js';

/**
 * Generate a self-contained HTML document where the markup IS the catalog.
 * Photo entries are semantic HTML elements. The viewer reads from the DOM.
 * JSON is a derived export format, not the source of truth.
 */
export function generateViewer(catalog: Catalog): string {
    const photosMarkup = catalog.photos.map(photoToMarkup).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(catalog.name)}</title>
<meta name="generator" content="one.fotos">
<meta name="fotos:version" content="${catalog.version}">
<meta name="fotos:created" content="${catalog.created}">
${catalog.device ? `<meta name="fotos:device" content="${esc(catalog.device)}">` : ''}
${STYLE}
</head>
<body>

<header>
    <h1>${esc(catalog.name)}</h1>
    <span class="stats" id="stats"></span>
    <a class="fotos-link" href="https://fotos.one" target="_blank" rel="noopener"><svg class="fotos-icon" viewBox="-516 -789 4926 3570" fill="currentColor"><path d="M-516.009,2169.311L-516.009,71.938C-516.009,-24.039 -477.882,-116.085 -410.016,-183.951C-342.15,-251.817 -250.104,-289.944 -154.127,-289.943L-57.989,-289.943L-57.989,-425.475C-57.989,-488.418 -6.963,-539.443 55.98,-539.443L831.131,-539.443C894.074,-539.443 945.1,-488.418 945.1,-425.475L945.1,-305.715C978.832,-325.601 1001.466,-362.306 1001.466,-404.298L1001.466,-558.612C1001.466,-685.821 1104.588,-788.943 1231.797,-788.943L2661.334,-788.943C2788.543,-788.943 2891.665,-685.821 2891.665,-558.612L2891.665,-404.297C2891.666,-341.141 2942.863,-289.943 3006.019,-289.943L4047.258,-289.943C4143.235,-289.944 4235.281,-251.817 4303.147,-183.951C4371.013,-116.085 4409.14,-24.039 4409.14,71.938L4409.14,2169.311C4409.14,2265.288 4371.013,2357.334 4303.147,2425.2C4235.281,2493.066 4143.235,2531.193 4047.258,2531.193L2825.074,2531.193C2564.35,2692.97 2261.586,2780.693 1949.779,2780.693L1943.352,2780.693C1621.931,2780.693 1321.846,2689.344 1067.641,2531.193L-154.127,2531.193C-250.104,2531.193 -342.15,2493.066 -410.016,2425.2C-477.882,2357.334 -516.009,2265.288 -516.009,2169.311ZM904.181,-173.966L-154.127,-173.966C-219.345,-173.966 -281.891,-148.058 -328.007,-101.943C-374.123,-55.827 -400.031,6.72 -400.031,71.938L-400.031,1417.215L309.706,1417.215C292.349,1320.979 283.287,1221.86 283.287,1120.625C283.287,913.446 322.015,710.26 395.462,520.746C352.276,543.874 302.924,556.989 250.51,556.989L249.49,556.989C79.674,556.989 -57.989,419.325 -57.989,249.509L-57.989,249.491C-57.989,79.675 79.674,-57.989 249.49,-57.989L250.51,-57.989C406.881,-57.989 535.989,58.74 555.452,209.814C617.178,115.753 688.754,27.534 769.509,-53.222C812.377,-96.09 857.349,-136.372 904.181,-173.966ZM829.122,-289.943L829.122,-423.466L57.989,-423.466L57.989,-289.943L829.122,-289.943ZM2797.082,-307.226C2783.353,-336.725 2775.688,-369.616 2775.688,-404.297L2775.688,-558.613C2775.688,-621.768 2724.49,-672.966 2661.334,-672.966L1231.796,-672.966C1168.641,-672.966 1117.443,-621.768 1117.443,-558.612L1117.443,-404.297C1117.443,-369.457 1109.708,-336.423 1095.86,-306.82C1350.196,-457.813 1642.566,-539.443 1943.352,-539.443L1949.779,-539.443C2259.305,-539.443 2549.046,-454.731 2797.082,-307.226ZM4293.162,1417.215L4293.162,71.937C4293.162,6.72 4267.254,-55.827 4221.139,-101.943C4175.023,-148.058 4112.476,-173.966 4047.258,-173.966L2989.034,-173.966C3058.772,-117.911 3123.885,-56.337 3183.711,10.094C3201.365,-29.998 3241.446,-57.989 3288.065,-57.989L4063.216,-57.989C4126.16,-57.989 4177.185,-6.963 4177.185,55.98L4177.185,443.02C4177.185,505.963 4126.16,556.989 4063.216,556.989L3511.711,556.989C3575.224,732.964 3609.844,922.751 3609.844,1120.625C3609.844,1220.786 3600.792,1320.014 3583.142,1417.215L4293.162,1417.215ZM2988.95,2415.215L4047.258,2415.215C4112.476,2415.215 4175.023,2389.308 4221.139,2343.192C4267.254,2297.076 4293.162,2234.529 4293.162,2169.311L4293.162,1533.193L3557.765,1533.193C3484.465,1818.849 3335.697,2082.396 3123.622,2294.471C3080.754,2337.339 3035.782,2377.621 2988.95,2415.215ZM904.097,2415.215C628.556,2193.735 425.213,1886.097 334.958,1533.193L-400.031,1533.193L-400.031,2169.312C-400.031,2234.529 -374.123,2297.076 -328.007,2343.192C-281.891,2389.308 -219.345,2415.215 -154.127,2415.215L904.097,2415.215ZM3290.074,140.929C3358.263,234.058 3416.979,334.558 3464.806,441.011L4061.208,441.011L4061.208,57.989L3290.074,57.989L3290.074,140.929ZM3493.867,1120.624C3493.866,267.848 2802.555,-423.466 1949.779,-423.466L1943.352,-423.466C1533.835,-423.466 1141.09,-260.786 851.517,28.787C561.945,318.359 399.264,711.107 399.264,1120.625C399.264,1973.401 1090.576,2664.715 1943.352,2664.715L1949.779,2664.715C2359.296,2664.715 2752.041,2502.035 3041.614,2212.462C3331.186,1922.89 3493.867,1530.142 3493.867,1120.624ZM3276.563,1120.665C3276.563,1472.685 3136.724,1810.292 2887.809,2059.208C2638.893,2308.123 2301.291,2447.962 1949.272,2447.962L1943.894,2447.962C1591.865,2447.962 1254.255,2308.119 1005.333,2059.197C756.411,1810.275 616.568,1472.665 616.568,1120.636L616.568,1120.613C616.568,768.584 756.411,430.974 1005.333,182.052C1254.255,-66.87 1591.865,-206.713 1943.894,-206.713L1949.191,-206.713C2301.232,-206.713 2638.854,-66.865 2887.785,182.065C3136.715,430.996 3276.563,768.624 3276.563,1120.665ZM1775.553,118.742C1563.349,300.592 1634.537,732.34 1934.423,1082.282C2234.31,1432.224 2650.062,1568.693 2862.266,1386.843C3074.47,1204.993 3003.282,773.245 2703.396,423.303C2403.509,73.361 1987.757,-63.108 1775.553,118.742ZM442.011,249.491C442.011,143.727 356.273,57.989 250.51,57.989L249.49,57.989C143.727,57.989 57.989,143.727 57.989,249.491L57.989,249.509C57.989,355.273 143.727,441.011 249.49,441.011L250.51,441.011C356.273,441.011 442.011,355.273 442.011,249.509L442.011,249.491Z"/></svg> fotos.one</a>
</header>

<nav class="controls">
    <input class="search" id="search" type="search" placeholder="Search by name, tag, camera...">
    <div class="tag-filter" id="tagFilter"></div>
    <div class="mode-toggle" role="tablist" aria-label="Gallery mode">
        <button class="mode-btn active" id="modeTimeline" data-mode="timeline">Timeline</button>
        <button class="mode-btn" id="modeFolders" data-mode="folders">Folders</button>
    </div>
    <div class="view-toggle">
        <button class="view-btn active" id="gridSmall" title="Small grid">&#9638;</button>
        <button class="view-btn" id="gridLarge" title="Large grid">&#9632;</button>
    </div>
</nav>

<main class="gallery" id="gallery">
${photosMarkup}
</main>

<div class="lightbox" id="lightbox" hidden>
    <div class="lb-toolbar" id="lbToolbar">
        <button class="lb-tool" id="lbZoomFit" title="Fit to screen (F)">Fit</button>
        <button class="lb-tool" id="lbZoom1" title="Actual pixels (1)">1:1</button>
        <div class="lb-sep"></div>
        <button class="lb-tool" id="lbZoomOut" title="Zoom out (-)">&#8722;</button>
        <span class="lb-zoom-label" id="lbZoomLabel">100%</span>
        <button class="lb-tool" id="lbZoomIn" title="Zoom in (+)">+</button>
        <div class="lb-sep"></div>
        <button class="lb-tool" id="lbRotCCW" title="Rotate left (L)">&#8630;</button>
        <button class="lb-tool" id="lbRotCW" title="Rotate right (R)">&#8631;</button>
        <button class="lb-tool" id="lbFlipH" title="Flip horizontal (H)">&#8596;</button>
        <button class="lb-tool" id="lbFlipV" title="Flip vertical (V)">&#8597;</button>
        <div class="lb-sep"></div>
        <button class="lb-tool danger" id="lbDelete" title="Delete (Del)">&#128465;</button>
    </div>
    <button class="lb-close" id="lbClose">&times;</button>
    <button class="lb-nav lb-prev" id="lbPrev">&#8249;</button>
    <button class="lb-nav lb-next" id="lbNext">&#8250;</button>
    <div class="lb-viewport" id="lbViewport">
        <img id="lbImg" src="" alt="">
    </div>
    <div class="lb-bottom">
        <div class="lb-name" id="lbName"></div>
        <div class="lb-details" id="lbDetails"></div>
        <div class="lb-tags" id="lbTags"></div>
    </div>
</div>

${SCRIPT}
</body>
</html>`;
}

/**
 * Convert a photo entry to semantic HTML markup.
 * The markup IS the data — the viewer reads from the DOM.
 */
function photoToMarkup(p: FotosEntry & {exif?: ExifData}): string {
    const attrs = [
        `data-hash="${esc(p.stream.id)}"`,
        `data-managed="${p.managed}"`,
        `data-added="${new Date(p.stream.created).toISOString()}"`,
        `data-size="${p.size}"`,
    ];
    if (p.sourcePath) attrs.push(`data-source="${esc(p.sourcePath)}"`);
    if (p.folderPath) attrs.push(`data-folder="${esc(p.folderPath)}"`);
    if (p.copies?.length) attrs.push(`data-copies="${esc(p.copies.join(','))}"`);

    const thumbSrc = p.thumb ? `thumbs/${p.thumb}` : '';
    const imgTag = thumbSrc
        ? `<img src="${esc(thumbSrc)}" alt="${esc(p.name)}" loading="lazy">`
        : '';

    const exifDl = p.exif ? exifToMarkup(p.exif) : '';

    const tagsList = p.tags.length
        ? `<ul class="tags">${p.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`
        : '';

    return `<article class="foto" ${attrs.join(' ')}>
  ${imgTag}
  <h3>${esc(p.name)}</h3>
  ${exifDl}
  ${tagsList}
</article>`;
}

function exifToMarkup(exif: ExifData): string {
    const items: string[] = [];
    if (exif.date) items.push(`<dt>date</dt><dd>${esc(exif.date)}</dd>`);
    if (exif.camera) items.push(`<dt>camera</dt><dd>${esc(exif.camera)}</dd>`);
    if (exif.lens) items.push(`<dt>lens</dt><dd>${esc(exif.lens)}</dd>`);
    if (exif.focalLength) items.push(`<dt>focal</dt><dd>${esc(exif.focalLength)}</dd>`);
    if (exif.aperture) items.push(`<dt>aperture</dt><dd>${esc(exif.aperture)}</dd>`);
    if (exif.shutter) items.push(`<dt>shutter</dt><dd>${esc(exif.shutter)}</dd>`);
    if (exif.iso) items.push(`<dt>iso</dt><dd>${exif.iso}</dd>`);
    if (exif.width && exif.height) items.push(`<dt>dimensions</dt><dd>${exif.width}\u00d7${exif.height}</dd>`);
    if (exif.gps) items.push(`<dt>gps</dt><dd>${exif.gps.lat},${exif.gps.lon}</dd>`);
    if (items.length === 0) return '';
    return `<dl class="exif">${items.join('')}</dl>`;
}

/**
 * Parse the DOM back to a catalog structure (for JSON export etc.)
 * This runs in the browser — the DOM is the source of truth.
 */
export function domToCatalogScript(): string {
    return `
function domToCatalog() {
    const fotos = document.querySelectorAll('article.foto');
    const photos = Array.from(fotos).map(el => {
        const entry = {
            hash: el.dataset.hash,
            name: el.querySelector('h3')?.textContent || '',
            managed: el.dataset.managed,
            addedAt: el.dataset.added,
            size: parseInt(el.dataset.size) || 0,
            tags: Array.from(el.querySelectorAll('.tags li')).map(li => li.textContent),
            sourcePath: el.dataset.source || undefined,
            folderPath: el.dataset.folder || undefined,
            copies: el.dataset.copies ? el.dataset.copies.split(',') : undefined,
        };
        const dl = el.querySelector('dl.exif');
        if (dl) {
            entry.exif = {};
            const dts = dl.querySelectorAll('dt');
            dts.forEach(dt => {
                const dd = dt.nextElementSibling;
                if (!dd) return;
                const key = dt.textContent;
                const val = dd.textContent;
                if (key === 'iso') entry.exif[key] = parseInt(val);
                else if (key === 'dimensions') {
                    const [w, h] = val.split('\\u00d7').map(Number);
                    entry.exif.width = w; entry.exif.height = h;
                } else if (key === 'gps') {
                    const [lat, lon] = val.split(',').map(Number);
                    entry.exif.gps = { lat, lon };
                } else entry.exif[key] = val;
            });
        }
        const img = el.querySelector('img');
        if (img) entry.thumb = img.getAttribute('src')?.replace('thumbs/', '');
        return entry;
    });
    return {
        version: 1,
        name: document.title,
        created: document.querySelector('meta[name="fotos:created"]')?.content || '',
        device: document.querySelector('meta[name="fotos:device"]')?.content || undefined,
        photos
    };
}`;
}

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// --- Embedded CSS ---
const STYLE = `<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111; color: #eee; }

header { padding: 16px 24px; background: #1a1a1a; border-bottom: 1px solid #333; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
header h1 { font-size: 18px; font-weight: 600; }
header .stats { color: #888; font-size: 13px; }
header .fotos-link { margin-left: auto; color: #555; font-size: 11px; text-decoration: none; display: flex; align-items: center; gap: 4px; }
header .fotos-link:hover { color: #aaa; }
.fotos-icon { width: 14px; height: 14px; }

.controls { padding: 12px 24px; background: #1a1a1a; border-bottom: 1px solid #222; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.search { background: #222; border: 1px solid #444; color: #eee; padding: 6px 12px; border-radius: 4px; font-size: 14px; min-width: 200px; }
.search:focus { outline: none; border-color: #666; }
.tag-filter { display: flex; gap: 6px; flex-wrap: wrap; }
.tag-btn { background: #2a2a2a; border: 1px solid #444; color: #ccc; padding: 4px 10px; border-radius: 12px; font-size: 12px; cursor: pointer; }
.tag-btn:hover { background: #333; }
.tag-btn.active { background: #335; border-color: #55a; color: #aaf; }
.mode-toggle { margin-left: auto; display: flex; gap: 4px; }
.mode-btn { background: #2a2a2a; border: 1px solid #444; color: #aaa; padding: 6px 12px; border-radius: 999px; cursor: pointer; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; }
.mode-btn.active { background: #335; border-color: #55a; color: #eef; }
.view-toggle { display: flex; gap: 4px; }
.view-btn { background: #2a2a2a; border: 1px solid #444; color: #888; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 16px; }
.view-btn.active { color: #eee; border-color: #666; }

/* Gallery: the markup is semantic, grouped client-side for browsing */
.gallery { padding: 16px; display: flex; flex-direction: column; gap: 20px; }
.gallery-group { display: flex; flex-direction: column; gap: 10px; }
.gallery-group[hidden] { display: none; }
.gallery-group-header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 0 4px; }
.gallery-group-title { color: #ddd; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.gallery-group-meta { color: #777; font-size: 11px; }
.gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.gallery.large .gallery-grid { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }

.foto { position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 4px; cursor: pointer; background: #222; }
.foto img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; display: block; }
.foto:hover img { transform: scale(1.05); }
.foto h3, .foto dl, .foto ul { position: absolute; }
.foto h3 { bottom: 0; left: 0; right: 0; padding: 24px 8px 8px; background: linear-gradient(transparent, rgba(0,0,0,0.8)); font-size: 12px; font-weight: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0; transition: opacity 0.2s; }
.foto:hover h3 { opacity: 1; }
.foto dl.exif { display: none; }
.foto ul.tags { top: 6px; right: 6px; display: flex; gap: 3px; flex-wrap: wrap; justify-content: flex-end; list-style: none; }
.foto ul.tags li { background: rgba(0,0,0,0.6); padding: 2px 6px; border-radius: 8px; font-size: 10px; color: #ccc; }
.foto ul.memory { display: none; }

/* Lightbox */
.lightbox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 100; flex-direction: column; }
.lightbox:not([hidden]) { display: flex; }

.lb-viewport { flex: 1; overflow: hidden; position: relative; cursor: grab; }
.lb-viewport.dragging { cursor: grabbing; }
.lb-viewport img { position: absolute; transform-origin: 0 0; will-change: transform; user-select: none; -webkit-user-drag: none; }

.lb-toolbar { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; z-index: 10; background: rgba(0,0,0,0.7); border-radius: 6px; padding: 4px; }
.lb-tool { background: none; border: 1px solid transparent; color: #999; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 14px; line-height: 1; min-width: 32px; text-align: center; }
.lb-tool:hover { color: #eee; background: rgba(255,255,255,0.1); }
.lb-tool.active { color: #aaf; border-color: #55a; }
.lb-tool.danger { color: #844; }
.lb-tool.danger:hover { color: #faa; }
.lb-sep { width: 1px; background: #444; margin: 2px 4px; }
.lb-zoom-label { color: #888; font-size: 11px; padding: 6px 4px; min-width: 44px; text-align: center; line-height: 1.3; }

.lightbox .lb-close { position: absolute; top: 12px; right: 16px; font-size: 28px; color: #888; cursor: pointer; background: none; border: none; z-index: 10; }
.lightbox .lb-close:hover { color: #eee; }
.lightbox .lb-nav { position: absolute; top: 50%; font-size: 36px; color: #666; cursor: pointer; background: none; border: none; padding: 16px; z-index: 10; }
.lightbox .lb-nav:hover { color: #eee; }
.lightbox .lb-prev { left: 8px; }
.lightbox .lb-next { right: 8px; }

.lb-bottom { background: rgba(0,0,0,0.6); padding: 8px 16px; text-align: center; z-index: 10; }
.lb-bottom .lb-name { font-size: 13px; }
.lb-bottom .lb-details { font-size: 11px; color: #888; margin-top: 2px; }
.lb-bottom .lb-tags { margin-top: 4px; display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; }
.lb-bottom .lb-tag { background: #2a2a2a; padding: 2px 8px; border-radius: 10px; font-size: 11px; color: #aaa; }
</style>`;

// --- Embedded JS ---
const SCRIPT = `<script>
// --- Read catalog from DOM ---
const BLOB_ROOT = localStorage.getItem('fotos_blob_root') || 'blobs';
const gallery = document.getElementById('gallery');
const allFotos = Array.from(gallery.querySelectorAll('article.foto'));
const deleted = [];

let activeTag = null;
let searchQuery = '';
let currentIndex = -1;
let filtered = [];
let galleryMode = 'timeline';

function fotoData(el) {
    return {
        el,
        hash: el.dataset.hash,
        name: el.querySelector('h3')?.textContent || '',
        managed: el.dataset.managed,
        addedAt: el.dataset.added || '',
        tags: Array.from(el.querySelectorAll('.tags li')).map(li => li.textContent),
        folderPath: el.dataset.folder || '',
        exif: readExif(el),
        thumb: el.querySelector('img')?.getAttribute('src') || '',
    };
}

const allFotoData = allFotos.map(fotoData);

function readExif(el) {
    const dl = el.querySelector('dl.exif');
    if (!dl) return {};
    const exif = {};
    dl.querySelectorAll('dt').forEach(dt => {
        const dd = dt.nextElementSibling;
        if (!dd) return;
        exif[dt.textContent] = dd.textContent;
    });
    return exif;
}

function photoSrc(f) {
    if (f.managed === 'ingested') return BLOB_ROOT + '/' + f.hash.slice(0,2) + '/' + f.hash;
    return f.thumb;
}

function parseExifDate(value) {
    if (!value) return Number.NaN;
    const normalized = value
        .trim()
        .replace(/^(\\d{4}):(\\d{2}):(\\d{2})/, '$1-$2-$3')
        .replace(' ', 'T');
    const timestamp = Date.parse(normalized);
    return Number.isNaN(timestamp) ? Number.NaN : timestamp;
}

function fotoTimestamp(f) {
    const exifTimestamp = parseExifDate(f.exif.date);
    if (!Number.isNaN(exifTimestamp)) return exifTimestamp;
    const addedTimestamp = Date.parse(f.addedAt || '');
    return Number.isNaN(addedTimestamp) ? 0 : addedTimestamp;
}

function timelineKey(f) {
    const timestamp = fotoTimestamp(f);
    if (!timestamp) return 'unknown';
    return new Date(timestamp).toISOString().slice(0, 10);
}

function timelineLabel(key) {
    if (key === 'unknown') return 'Unknown date';
    const timestamp = Date.parse(key + 'T00:00:00Z');
    if (Number.isNaN(timestamp)) return key;
    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short',
    }).format(new Date(timestamp));
}

function folderKey(f) {
    return f.folderPath || 'Unfiled';
}

function compareFolderKeys(left, right) {
    if (left === right) return 0;
    if (left === 'Unfiled') return 1;
    if (right === 'Unfiled') return -1;
    return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

function compareByNewest(left, right) {
    return fotoTimestamp(right) - fotoTimestamp(left)
        || left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

function orderFotos(fotos) {
    const ordered = [...fotos];
    if (galleryMode === 'folders') {
        ordered.sort((left, right) =>
            compareFolderKeys(folderKey(left), folderKey(right))
            || compareByNewest(left, right)
        );
        return ordered;
    }
    ordered.sort(compareByNewest);
    return ordered;
}

function currentGroupKey(f) {
    return galleryMode === 'folders' ? folderKey(f) : timelineKey(f);
}

function currentGroupLabel(key) {
    return galleryMode === 'folders' ? key : timelineLabel(key);
}

function photoCountLabel(count) {
    return count === 1 ? '1 photo' : count + ' photos';
}

function matchesSearch(f, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return f.name.toLowerCase().includes(q)
        || f.tags.some(t => t.toLowerCase().includes(q))
        || (f.folderPath || '').toLowerCase().includes(q)
        || (f.exif.camera || '').toLowerCase().includes(q)
        || (f.exif.date || '').includes(q);
}

function renderGallery(ordered, matchesFilter) {
    const groups = [];
    const groupByKey = new Map();

    ordered.forEach(f => {
        const key = currentGroupKey(f);
        let group = groupByKey.get(key);
        if (!group) {
            group = {
                key,
                label: currentGroupLabel(key),
                items: [],
                visibleCount: 0,
            };
            groupByKey.set(key, group);
            groups.push(group);
        }
        group.items.push(f);
        if (!f.el.hidden && matchesFilter(f)) group.visibleCount += 1;
    });

    gallery.innerHTML = '';
    const fragment = document.createDocumentFragment();

    groups.forEach(group => {
        const section = document.createElement('section');
        section.className = 'gallery-group';
        section.hidden = group.visibleCount === 0;

        const header = document.createElement('header');
        header.className = 'gallery-group-header';

        const title = document.createElement('div');
        title.className = 'gallery-group-title';
        title.textContent = group.label;

        const meta = document.createElement('div');
        meta.className = 'gallery-group-meta';
        meta.textContent = photoCountLabel(group.visibleCount);

        const grid = document.createElement('div');
        grid.className = 'gallery-grid';

        header.append(title, meta);
        section.append(header, grid);

        group.items.forEach(f => {
            const isVisible = !f.el.hidden && matchesFilter(f);
            f.el.style.display = isVisible ? '' : 'none';
            grid.appendChild(f.el);
        });

        fragment.appendChild(section);
    });

    gallery.appendChild(fragment);
}

function updateModeButtons() {
    document.getElementById('modeTimeline').classList.toggle('active', galleryMode === 'timeline');
    document.getElementById('modeFolders').classList.toggle('active', galleryMode === 'folders');
}

function applyFilters() {
    const ordered = orderFotos(allFotoData);
    const matchesFilter = f => (!activeTag || f.tags.includes(activeTag)) && matchesSearch(f, searchQuery);
    filtered = ordered.filter(f => !f.el.hidden && matchesFilter(f));
    renderGallery(ordered, matchesFilter);
    const total = allFotoData.filter(f => !f.el.hidden).length;
    document.getElementById('stats').textContent =
        filtered.length + ' of ' + total + ' photos'
        + (deleted.length ? ' (' + deleted.length + ' pending delete)' : '');
}

function renderTags() {
    const tags = {};
    allFotoData.forEach(f => {
        if (f.el.hidden) return;
        f.tags.forEach(t => {
            tags[t] = (tags[t] || 0) + 1;
        });
    });
    const sorted = Object.entries(tags).sort((a,b) => b[1] - a[1]);
    document.getElementById('tagFilter').innerHTML =
        '<button class="tag-btn' + (!activeTag ? ' active' : '') + '" data-tag="">All</button>' +
        sorted.map(([t,n]) =>
            '<button class="tag-btn' + (activeTag===t ? ' active' : '') + '" data-tag="' + t + '">'
            + t + ' (' + n + ')</button>'
        ).join('');
}

// --- Image viewer state ---
let vw = { scale: 1, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false, mode: 'fit', natW: 0, natH: 0 };
let drag = { active: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 };

const $vp = () => document.getElementById('lbViewport');
const $img = () => document.getElementById('lbImg');

function fitScale() {
    const vp = $vp();
    if (!vp || !vw.natW) return 1;
    const isRotated = (vw.rotation % 180) !== 0;
    const imgW = isRotated ? vw.natH : vw.natW;
    const imgH = isRotated ? vw.natW : vw.natH;
    const pad = 16;
    return Math.min((vp.clientWidth - pad) / imgW, (vp.clientHeight - pad) / imgH, 1);
}

function zoomFit() { vw.scale = fitScale(); vw.mode = 'fit'; centerImage(); updateTransform(); }
function zoom1to1() { vw.scale = 1; vw.mode = '1:1'; centerImage(); updateTransform(); }

function zoomBy(factor, cx, cy) {
    const vp = $vp();
    if (!vp) return;
    if (cx === undefined) { cx = vp.clientWidth / 2; cy = vp.clientHeight / 2; }
    const oldScale = vw.scale;
    vw.scale = Math.max(0.05, Math.min(20, vw.scale * factor));
    const ratio = vw.scale / oldScale;
    vw.panX = cx - ratio * (cx - vw.panX);
    vw.panY = cy - ratio * (cy - vw.panY);
    vw.mode = 'custom';
    updateTransform();
}

function centerImage() {
    const vp = $vp();
    if (!vp) return;
    const isRotated = (vw.rotation % 180) !== 0;
    const dispW = (isRotated ? vw.natH : vw.natW) * vw.scale;
    const dispH = (isRotated ? vw.natW : vw.natH) * vw.scale;
    vw.panX = (vp.clientWidth - dispW) / 2;
    vw.panY = (vp.clientHeight - dispH) / 2;
}

function updateTransform() {
    const img = $img();
    if (!img) return;
    const isRotated = (vw.rotation % 180) !== 0;
    let tx = vw.panX, ty = vw.panY;
    if (isRotated) {
        const w = vw.natW * vw.scale, h = vw.natH * vw.scale;
        if (vw.rotation === 90 || vw.rotation === -270) { tx = vw.panX + h; }
        if (vw.rotation === 270 || vw.rotation === -90) { ty = vw.panY + w; }
    }
    const sx = (vw.flipH ? -vw.scale : vw.scale);
    const sy = (vw.flipV ? -vw.scale : vw.scale);
    const ox = vw.flipH ? vw.natW : 0;
    const oy = vw.flipV ? vw.natH : 0;
    img.style.transformOrigin = ox + 'px ' + oy + 'px';
    img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) rotate(' + vw.rotation + 'deg) scale(' + sx + ',' + sy + ')';
    img.style.width = vw.natW + 'px';
    img.style.height = vw.natH + 'px';
    document.getElementById('lbZoomLabel').textContent = Math.round(vw.scale * 100) + '%';
    document.getElementById('lbZoomFit').classList.toggle('active', vw.mode === 'fit');
    document.getElementById('lbZoom1').classList.toggle('active', vw.mode === '1:1');
}

function rotate(deg) {
    vw.rotation = ((vw.rotation + deg) % 360 + 360) % 360;
    if (vw.mode === 'fit') vw.scale = fitScale();
    centerImage();
    updateTransform();
}

function flipH() { vw.flipH = !vw.flipH; updateTransform(); }
function flipV() { vw.flipV = !vw.flipV; updateTransform(); }

function openLightbox(index) {
    currentIndex = index;
    const f = filtered[index];
    if (!f) return;
    vw = { scale: 1, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false, mode: 'fit', natW: 0, natH: 0 };
    const img = $img();
    img.onload = () => { vw.natW = img.naturalWidth; vw.natH = img.naturalHeight; zoomFit(); };
    img.src = photoSrc(f);
    img.alt = f.name;

    document.getElementById('lbName').textContent = f.name;
    const parts = [];
    if (f.exif.date) parts.push(f.exif.date);
    if (f.exif.camera) parts.push(f.exif.camera);
    if (f.exif.focal) parts.push(f.exif.focal);
    if (f.exif.aperture) parts.push(f.exif.aperture);
    if (f.exif.shutter) parts.push(f.exif.shutter);
    if (f.exif.iso) parts.push('ISO ' + f.exif.iso);
    if (f.exif.dimensions) parts.push(f.exif.dimensions);
    document.getElementById('lbDetails').textContent = parts.join(' \\u00b7 ');
    document.getElementById('lbTags').innerHTML =
        f.tags.map(t => '<span class="lb-tag">' + t + '</span>').join('');

    document.getElementById('lightbox').hidden = false;
}

function closeLightbox() {
    document.getElementById('lightbox').hidden = true;
    $img().src = '';
    currentIndex = -1;
}

// --- Init ---
updateModeButtons();
renderTags();
applyFilters();

// --- Events ---
document.getElementById('search').addEventListener('input', e => { searchQuery = e.target.value; applyFilters(); });
document.getElementById('tagFilter').addEventListener('click', e => {
    const btn = e.target.closest('.tag-btn');
    if (!btn) return;
    activeTag = btn.dataset.tag || null;
    renderTags();
    applyFilters();
});

document.getElementById('modeTimeline').addEventListener('click', () => {
    galleryMode = 'timeline';
    updateModeButtons();
    applyFilters();
});
document.getElementById('modeFolders').addEventListener('click', () => {
    galleryMode = 'folders';
    updateModeButtons();
    applyFilters();
});

gallery.addEventListener('click', e => {
    const foto = e.target.closest('article.foto');
    if (!foto) return;
    const idx = filtered.findIndex(f => f.el === foto);
    if (idx >= 0) openLightbox(idx);
});

document.getElementById('gridSmall').addEventListener('click', () => {
    document.getElementById('gallery').classList.remove('large');
    document.getElementById('gridSmall').classList.add('active');
    document.getElementById('gridLarge').classList.remove('active');
});
document.getElementById('gridLarge').addEventListener('click', () => {
    document.getElementById('gallery').classList.add('large');
    document.getElementById('gridLarge').classList.add('active');
    document.getElementById('gridSmall').classList.remove('active');
});

// --- Lightbox toolbar ---
document.getElementById('lbZoomFit').addEventListener('click', zoomFit);
document.getElementById('lbZoom1').addEventListener('click', zoom1to1);
document.getElementById('lbZoomIn').addEventListener('click', () => zoomBy(1.25));
document.getElementById('lbZoomOut').addEventListener('click', () => zoomBy(0.8));
document.getElementById('lbRotCW').addEventListener('click', () => rotate(90));
document.getElementById('lbRotCCW').addEventListener('click', () => rotate(-90));
document.getElementById('lbFlipH').addEventListener('click', flipH);
document.getElementById('lbFlipV').addEventListener('click', flipV);
document.getElementById('lbClose').addEventListener('click', closeLightbox);
document.getElementById('lbPrev').addEventListener('click', () => { if (currentIndex > 0) openLightbox(currentIndex - 1); });
document.getElementById('lbNext').addEventListener('click', () => { if (currentIndex < filtered.length - 1) openLightbox(currentIndex + 1); });

document.getElementById('lbDelete').addEventListener('click', () => {
    if (currentIndex < 0) return;
    const f = filtered[currentIndex];
    f.el.hidden = true;
    deleted.push(f.hash);
    if (filtered.length > 1 && currentIndex < filtered.length - 1) {
        applyFilters(); renderTags();
        openLightbox(Math.min(currentIndex, filtered.length - 1));
    } else if (filtered.length > 1) {
        applyFilters(); renderTags();
        openLightbox(filtered.length - 1);
    } else {
        closeLightbox(); renderTags(); applyFilters();
    }
});

// --- Viewport pan ---
const viewport = document.getElementById('lbViewport');
viewport.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    drag = { active: true, startX: e.clientX, startY: e.clientY, startPanX: vw.panX, startPanY: vw.panY };
    viewport.classList.add('dragging');
    e.preventDefault();
});
window.addEventListener('mousemove', e => {
    if (!drag.active) return;
    vw.panX = drag.startPanX + (e.clientX - drag.startX);
    vw.panY = drag.startPanY + (e.clientY - drag.startY);
    vw.mode = 'custom';
    updateTransform();
});
window.addEventListener('mouseup', () => { drag.active = false; viewport.classList.remove('dragging'); });

// --- Scroll zoom ---
viewport.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.15 : 0.87, e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });

// --- Double click: toggle fit / 1:1 ---
viewport.addEventListener('dblclick', e => {
    if (vw.mode === 'fit' && vw.scale < 1) {
        const rect = viewport.getBoundingClientRect();
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
        const ratio = 1 / vw.scale;
        vw.panX = cx - ratio * (cx - vw.panX);
        vw.panY = cy - ratio * (cy - vw.panY);
        vw.scale = 1; vw.mode = '1:1';
        updateTransform();
    } else zoomFit();
});

// --- Keyboard ---
document.addEventListener('keydown', e => {
    if (currentIndex < 0) return;
    if (e.target.tagName === 'INPUT') return;
    switch(e.key) {
        case 'Escape': closeLightbox(); break;
        case 'ArrowLeft': if (currentIndex > 0) openLightbox(currentIndex - 1); break;
        case 'ArrowRight': if (currentIndex < filtered.length - 1) openLightbox(currentIndex + 1); break;
        case 'f': case 'F': zoomFit(); break;
        case '1': zoom1to1(); break;
        case '=': case '+': zoomBy(1.25); break;
        case '-': zoomBy(0.8); break;
        case '0': zoomFit(); break;
        case 'r': case 'R': rotate(e.shiftKey ? -90 : 90); break;
        case 'l': case 'L': rotate(-90); break;
        case 'h': case 'H': flipH(); break;
        case 'v': case 'V': flipV(); break;
        case 'Delete': case 'Backspace': document.getElementById('lbDelete').click(); break;
    }
});

window.addEventListener('resize', () => { if (currentIndex >= 0 && vw.mode === 'fit') zoomFit(); });

// --- JSON export helper ---
${domToCatalogScript()}
</script>`;
