import type { Catalog, PhotoEntry, ExifData } from './types.js';

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
</header>

<nav class="controls">
    <input class="search" id="search" type="search" placeholder="Search by name, tag, camera...">
    <div class="tag-filter" id="tagFilter"></div>
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
function photoToMarkup(p: PhotoEntry): string {
    const attrs = [
        `data-hash="${esc(p.hash)}"`,
        `data-managed="${p.managed}"`,
        `data-added="${esc(p.addedAt)}"`,
        `data-size="${p.size}"`,
    ];
    if (p.sourcePath) attrs.push(`data-source="${esc(p.sourcePath)}"`);
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

.controls { padding: 12px 24px; background: #1a1a1a; border-bottom: 1px solid #222; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.search { background: #222; border: 1px solid #444; color: #eee; padding: 6px 12px; border-radius: 4px; font-size: 14px; min-width: 200px; }
.search:focus { outline: none; border-color: #666; }
.tag-filter { display: flex; gap: 6px; flex-wrap: wrap; }
.tag-btn { background: #2a2a2a; border: 1px solid #444; color: #ccc; padding: 4px 10px; border-radius: 12px; font-size: 12px; cursor: pointer; }
.tag-btn:hover { background: #333; }
.tag-btn.active { background: #335; border-color: #55a; color: #aaf; }
.view-toggle { margin-left: auto; display: flex; gap: 4px; }
.view-btn { background: #2a2a2a; border: 1px solid #444; color: #888; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 16px; }
.view-btn.active { color: #eee; border-color: #666; }

/* Gallery: the markup is semantic, display as grid */
.gallery { padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.gallery.large { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }

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
const allFotos = Array.from(document.querySelectorAll('article.foto'));
const deleted = [];

let activeTag = null;
let searchQuery = '';
let currentIndex = -1;
let filtered = [];

function fotoData(el) {
    return {
        el,
        hash: el.dataset.hash,
        name: el.querySelector('h3')?.textContent || '',
        managed: el.dataset.managed,
        tags: Array.from(el.querySelectorAll('.tags li')).map(li => li.textContent),
        exif: readExif(el),
        thumb: el.querySelector('img')?.getAttribute('src') || '',
    };
}

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

function matchesSearch(f, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return f.name.toLowerCase().includes(q)
        || f.tags.some(t => t.toLowerCase().includes(q))
        || (f.exif.camera || '').toLowerCase().includes(q)
        || (f.exif.date || '').includes(q);
}

function applyFilters() {
    filtered = allFotos.filter(el => !el.hidden).map(fotoData).filter(f => {
        if (activeTag && !f.tags.includes(activeTag)) return false;
        return matchesSearch(f, searchQuery);
    });
    // Show/hide articles in the DOM
    allFotos.forEach(el => {
        if (el.hidden) { el.style.display = 'none'; return; }
        const f = fotoData(el);
        const match = (!activeTag || f.tags.includes(activeTag)) && matchesSearch(f, searchQuery);
        el.style.display = match ? '' : 'none';
    });
    const total = allFotos.filter(el => !el.hidden).length;
    document.getElementById('stats').textContent =
        filtered.length + ' of ' + total + ' photos'
        + (deleted.length ? ' (' + deleted.length + ' pending delete)' : '');
}

function renderTags() {
    const tags = {};
    allFotos.forEach(el => {
        if (el.hidden) return;
        el.querySelectorAll('.tags li').forEach(li => {
            const t = li.textContent;
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

document.getElementById('gallery').addEventListener('click', e => {
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
