import type { Catalog } from './types.js';

/**
 * Generate a self-contained HTML viewer with the catalog inlined.
 * Works from file:// — no server needed.
 */
export function generateViewer(catalog: Catalog): string {
    const catalogJson = JSON.stringify(catalog);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(catalog.name)} - one.fotos</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111; color: #eee; }

.header { padding: 16px 24px; background: #1a1a1a; border-bottom: 1px solid #333; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.header h1 { font-size: 18px; font-weight: 600; }
.header .stats { color: #888; font-size: 13px; }

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

.grid { padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.grid.large { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }

.card { position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 4px; cursor: pointer; background: #222; }
.card img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; }
.card:hover img { transform: scale(1.05); }
.card .info { position: absolute; bottom: 0; left: 0; right: 0; padding: 8px; background: linear-gradient(transparent, rgba(0,0,0,0.8)); opacity: 0; transition: opacity 0.2s; }
.card:hover .info { opacity: 1; }
.card .info .name { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card .info .date { font-size: 11px; color: #999; }
.card .tags-overlay { position: absolute; top: 6px; right: 6px; display: flex; gap: 3px; flex-wrap: wrap; justify-content: flex-end; }
.card .tag-pill { background: rgba(0,0,0,0.6); padding: 2px 6px; border-radius: 8px; font-size: 10px; color: #ccc; }

/* Lightbox */
.lightbox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 100; flex-direction: column; }
.lightbox.open { display: flex; }

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

.no-thumb { display: flex; align-items: center; justify-content: center; color: #555; font-size: 13px; height: 100%; }
</style>
</head>
<body>

<div class="header">
    <h1 id="title"></h1>
    <span class="stats" id="stats"></span>
</div>

<div class="controls">
    <input class="search" id="search" type="text" placeholder="Search by name, tag, camera...">
    <div class="tag-filter" id="tagFilter"></div>
    <div class="view-toggle">
        <button class="view-btn active" id="gridSmall" title="Small grid">&#9638;</button>
        <button class="view-btn" id="gridLarge" title="Large grid">&#9632;</button>
    </div>
</div>

<div class="grid" id="grid"></div>

<div class="lightbox" id="lightbox">
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
        <img id="lbImg" src="">
    </div>
    <div class="lb-bottom">
        <div class="lb-name" id="lbName"></div>
        <div class="lb-details" id="lbDetails"></div>
        <div class="lb-tags" id="lbTags"></div>
    </div>
</div>

<script>
const catalog = ${catalogJson};
const BLOB_ROOT = localStorage.getItem('fotos_blob_root') || 'blobs';
const THUMB_ROOT = 'thumbs';

let activeTag = null;
let searchQuery = '';
let currentIndex = -1;
let filtered = [];
const deleted = [];

// Image viewer state
let vw = { scale: 1, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false, mode: 'fit', natW: 0, natH: 0 };
let drag = { active: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 };

const $vp = () => document.getElementById('lbViewport');
const $img = () => document.getElementById('lbImg');
const $zl = () => document.getElementById('lbZoomLabel');

function photoSrc(p) {
    if (p.managed === 'ingested') return BLOB_ROOT + '/' + p.hash.slice(0,2) + '/' + p.hash;
    if (p.thumb) return THUMB_ROOT + '/' + p.thumb;
    return '';
}

function thumbSrc(p) {
    if (p.thumb) return THUMB_ROOT + '/' + p.thumb;
    return photoSrc(p);
}

function matchesSearch(p, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return p.name.toLowerCase().includes(q)
        || p.tags.some(t => t.toLowerCase().includes(q))
        || (p.exif?.camera || '').toLowerCase().includes(q)
        || (p.exif?.date || '').includes(q);
}

function applyFilters() {
    filtered = catalog.photos.filter(p => {
        if (activeTag && !p.tags.includes(activeTag)) return false;
        if (!matchesSearch(p, searchQuery)) return false;
        return true;
    });
    renderGrid();
}

function renderGrid() {
    const grid = document.getElementById('grid');
    grid.innerHTML = filtered.map((p, i) => {
        const src = thumbSrc(p);
        const date = p.exif?.date ? p.exif.date.split('T')[0] : '';
        const tagsHtml = p.tags.map(t => '<span class="tag-pill">' + escapeHtml(t) + '</span>').join('');
        return '<div class="card" data-index="' + i + '">'
            + (src ? '<img loading="lazy" src="' + escapeHtml(src) + '" alt="' + escapeHtml(p.name) + '">'
                   : '<div class="no-thumb">' + escapeHtml(p.name) + '</div>')
            + '<div class="tags-overlay">' + tagsHtml + '</div>'
            + '<div class="info"><div class="name">' + escapeHtml(p.name) + '</div>'
            + (date ? '<div class="date">' + date + '</div>' : '')
            + '</div></div>';
    }).join('');

    document.getElementById('stats').textContent =
        filtered.length + ' of ' + catalog.photos.length + ' photos';
}

function renderTags() {
    const tags = {};
    catalog.photos.forEach(p => p.tags.forEach(t => { tags[t] = (tags[t]||0) + 1; }));
    const sorted = Object.entries(tags).sort((a,b) => b[1] - a[1]);
    document.getElementById('tagFilter').innerHTML =
        '<button class="tag-btn' + (!activeTag ? ' active' : '') + '" data-tag="">All</button>' +
        sorted.map(([t,n]) =>
            '<button class="tag-btn' + (activeTag===t ? ' active' : '') + '" data-tag="' + escapeHtml(t) + '">'
            + escapeHtml(t) + ' (' + n + ')</button>'
        ).join('');
}

// --- Image viewer ---

function fitScale() {
    const vp = $vp();
    if (!vp || !vw.natW) return 1;
    const isRotated = (vw.rotation % 180) !== 0;
    const imgW = isRotated ? vw.natH : vw.natW;
    const imgH = isRotated ? vw.natW : vw.natH;
    const pad = 16;
    return Math.min((vp.clientWidth - pad) / imgW, (vp.clientHeight - pad) / imgH, 1);
}

function zoomFit() {
    vw.scale = fitScale();
    vw.mode = 'fit';
    centerImage();
    updateTransform();
}

function zoom1to1() {
    vw.scale = 1;
    vw.mode = '1:1';
    centerImage();
    updateTransform();
}

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
    const w = vw.natW * vw.scale;
    const h = vw.natH * vw.scale;
    // For rotated images, offset so rotation center stays correct
    let tx = vw.panX, ty = vw.panY;
    if (isRotated) {
        tx += (isRotated ? h : 0);
        if (vw.rotation === 270 || vw.rotation === -90) { tx = vw.panX; ty = vw.panY + w; }
    }
    const parts = ['translate(' + tx + 'px,' + ty + 'px)'];
    parts.push('rotate(' + vw.rotation + 'deg)');
    parts.push('scale(' + (vw.flipH ? -vw.scale : vw.scale) + ',' + (vw.flipV ? -vw.scale : vw.scale) + ')');
    // Adjust origin for flips when rotated
    if (vw.flipH || vw.flipV) {
        const ox = vw.flipH ? vw.natW : 0;
        const oy = vw.flipV ? vw.natH : 0;
        img.style.transformOrigin = ox + 'px ' + oy + 'px';
    } else {
        img.style.transformOrigin = '0 0';
    }
    img.style.transform = parts.join(' ');
    img.style.width = vw.natW + 'px';
    img.style.height = vw.natH + 'px';

    $zl().textContent = Math.round(vw.scale * 100) + '%';

    // Highlight active mode button
    document.getElementById('lbZoomFit').classList.toggle('active', vw.mode === 'fit');
    document.getElementById('lbZoom1').classList.toggle('active', vw.mode === '1:1');
}

function rotate(deg) {
    vw.rotation = ((vw.rotation + deg) % 360 + 360) % 360;
    if (vw.mode === 'fit') { vw.scale = fitScale(); }
    centerImage();
    updateTransform();
}

function flipH() { vw.flipH = !vw.flipH; updateTransform(); }
function flipV() { vw.flipV = !vw.flipV; updateTransform(); }

function openLightbox(index) {
    currentIndex = index;
    const p = filtered[index];
    if (!p) return;

    // Reset viewer state
    vw = { scale: 1, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false, mode: 'fit', natW: 0, natH: 0 };

    const img = $img();
    img.onload = () => {
        vw.natW = img.naturalWidth;
        vw.natH = img.naturalHeight;
        zoomFit();
    };
    img.src = photoSrc(p);

    document.getElementById('lbName').textContent = p.name;
    const parts = [];
    if (p.exif?.date) parts.push(p.exif.date);
    if (p.exif?.camera) parts.push(p.exif.camera);
    if (p.exif?.focalLength) parts.push(p.exif.focalLength);
    if (p.exif?.aperture) parts.push(p.exif.aperture);
    if (p.exif?.shutter) parts.push(p.exif.shutter);
    if (p.exif?.iso) parts.push('ISO ' + p.exif.iso);
    if (p.exif?.width && p.exif?.height) parts.push(p.exif.width + '\\u00d7' + p.exif.height);
    document.getElementById('lbDetails').textContent = parts.join(' \\u00b7 ');

    document.getElementById('lbTags').innerHTML =
        p.tags.map(t => '<span class="lb-tag">' + escapeHtml(t) + '</span>').join('');

    document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
    $img().src = '';
    currentIndex = -1;
}

function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Init
document.getElementById('title').textContent = catalog.name;
renderTags();
applyFilters();

// --- Grid events ---
document.getElementById('search').addEventListener('input', e => {
    searchQuery = e.target.value;
    applyFilters();
});

document.getElementById('tagFilter').addEventListener('click', e => {
    const btn = e.target.closest('.tag-btn');
    if (!btn) return;
    activeTag = btn.dataset.tag || null;
    renderTags();
    applyFilters();
});

document.getElementById('grid').addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (!card) return;
    openLightbox(parseInt(card.dataset.index));
});

document.getElementById('gridSmall').addEventListener('click', () => {
    document.getElementById('grid').classList.remove('large');
    document.getElementById('gridSmall').classList.add('active');
    document.getElementById('gridLarge').classList.remove('active');
});
document.getElementById('gridLarge').addEventListener('click', () => {
    document.getElementById('grid').classList.add('large');
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
document.getElementById('lbPrev').addEventListener('click', () => {
    if (currentIndex > 0) openLightbox(currentIndex - 1);
});
document.getElementById('lbNext').addEventListener('click', () => {
    if (currentIndex < filtered.length - 1) openLightbox(currentIndex + 1);
});

document.getElementById('lbDelete').addEventListener('click', () => {
    if (currentIndex < 0) return;
    const photo = filtered[currentIndex];
    const idx = catalog.photos.indexOf(photo);
    if (idx !== -1) {
        catalog.photos.splice(idx, 1);
        deleted.push(photo.hash);
    }
    // Show next image or close
    if (filtered.length > 1 && currentIndex < filtered.length - 1) {
        applyFilters();
        renderTags();
        openLightbox(Math.min(currentIndex, filtered.length - 1));
    } else if (filtered.length > 1) {
        applyFilters();
        renderTags();
        openLightbox(filtered.length - 1);
    } else {
        closeLightbox();
        renderTags();
        applyFilters();
    }
    document.getElementById('stats').textContent =
        filtered.length + ' of ' + catalog.photos.length + ' photos'
        + (deleted.length ? ' (' + deleted.length + ' pending delete)' : '');
});

// --- Viewport drag to pan ---
const viewport = document.getElementById('lbViewport');

viewport.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    drag.active = true;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.startPanX = vw.panX;
    drag.startPanY = vw.panY;
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

window.addEventListener('mouseup', () => {
    drag.active = false;
    viewport.classList.remove('dragging');
});

// --- Scroll wheel zoom (centered on cursor) ---
viewport.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    zoomBy(factor, cx, cy);
}, { passive: false });

// --- Double click to toggle fit / 1:1 ---
viewport.addEventListener('dblclick', e => {
    if (vw.mode === 'fit' && vw.scale < 1) {
        // Zoom to 1:1 centered on click
        const rect = viewport.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const oldScale = vw.scale;
        vw.scale = 1;
        const ratio = 1 / oldScale;
        vw.panX = cx - ratio * (cx - vw.panX);
        vw.panY = cy - ratio * (cy - vw.panY);
        vw.mode = '1:1';
        updateTransform();
    } else {
        zoomFit();
    }
});

// --- Keyboard shortcuts ---
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

// Refit on window resize
window.addEventListener('resize', () => {
    if (currentIndex >= 0 && vw.mode === 'fit') zoomFit();
});
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
