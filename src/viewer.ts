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
.lightbox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 100; flex-direction: column; align-items: center; justify-content: center; }
.lightbox.open { display: flex; }
.lightbox img { max-width: 90vw; max-height: 80vh; object-fit: contain; }
.lightbox .lb-close { position: absolute; top: 16px; right: 24px; font-size: 28px; color: #888; cursor: pointer; background: none; border: none; }
.lightbox .lb-close:hover { color: #eee; }
.lightbox .lb-delete { position: absolute; top: 16px; left: 24px; font-size: 20px; color: #844; cursor: pointer; background: none; border: 1px solid #633; border-radius: 4px; padding: 4px 12px; }
.lightbox .lb-delete:hover { color: #faa; border-color: #a55; }
.lightbox .lb-nav { position: absolute; top: 50%; font-size: 36px; color: #888; cursor: pointer; background: none; border: none; padding: 16px; }
.lightbox .lb-nav:hover { color: #eee; }
.lightbox .lb-prev { left: 8px; }
.lightbox .lb-next { right: 8px; }
.lightbox .lb-meta { padding: 16px; text-align: center; max-width: 600px; }
.lightbox .lb-meta .lb-name { font-size: 14px; margin-bottom: 4px; }
.lightbox .lb-meta .lb-details { font-size: 12px; color: #888; }
.lightbox .lb-meta .lb-tags { margin-top: 8px; display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; }
.lightbox .lb-meta .lb-tag { background: #2a2a2a; padding: 2px 8px; border-radius: 10px; font-size: 11px; color: #aaa; }

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
    <button class="lb-delete" id="lbDelete">Delete</button>
    <button class="lb-close" id="lbClose">&times;</button>
    <button class="lb-nav lb-prev" id="lbPrev">&#8249;</button>
    <button class="lb-nav lb-next" id="lbNext">&#8250;</button>
    <img id="lbImg" src="">
    <div class="lb-meta">
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

function openLightbox(index) {
    currentIndex = index;
    const p = filtered[index];
    if (!p) return;
    document.getElementById('lbImg').src = photoSrc(p);
    document.getElementById('lbName').textContent = p.name;

    const parts = [];
    if (p.exif?.date) parts.push(p.exif.date);
    if (p.exif?.camera) parts.push(p.exif.camera);
    if (p.exif?.focalLength) parts.push(p.exif.focalLength);
    if (p.exif?.aperture) parts.push(p.exif.aperture);
    if (p.exif?.shutter) parts.push(p.exif.shutter);
    if (p.exif?.iso) parts.push('ISO ' + p.exif.iso);
    document.getElementById('lbDetails').textContent = parts.join(' · ');

    document.getElementById('lbTags').innerHTML =
        p.tags.map(t => '<span class="lb-tag">' + escapeHtml(t) + '</span>').join('');

    document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
    currentIndex = -1;
}

function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Init
document.getElementById('title').textContent = catalog.name;
renderTags();
applyFilters();

// Events
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

document.getElementById('lbDelete').addEventListener('click', () => {
    if (currentIndex < 0) return;
    const photo = filtered[currentIndex];
    const idx = catalog.photos.indexOf(photo);
    if (idx !== -1) {
        catalog.photos.splice(idx, 1);
        deleted.push(photo.hash);
    }
    closeLightbox();
    renderTags();
    applyFilters();
    document.getElementById('stats').textContent =
        filtered.length + ' of ' + catalog.photos.length + ' photos'
        + (deleted.length ? ' (' + deleted.length + ' deleted)' : '');
});

document.getElementById('lbClose').addEventListener('click', closeLightbox);
document.getElementById('lbPrev').addEventListener('click', () => {
    if (currentIndex > 0) openLightbox(currentIndex - 1);
});
document.getElementById('lbNext').addEventListener('click', () => {
    if (currentIndex < filtered.length - 1) openLightbox(currentIndex + 1);
});

document.addEventListener('keydown', e => {
    if (currentIndex < 0) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft' && currentIndex > 0) openLightbox(currentIndex - 1);
    if (e.key === 'ArrowRight' && currentIndex < filtered.length - 1) openLightbox(currentIndex + 1);
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
