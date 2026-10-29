import { readTags } from './metadata.js';
import { parsePlaylist, matchPlaylist } from './playlist-import.js';

const $ = s => document.querySelector(s);
const audio = $('#audio');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fold = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = t => t > 0 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '';
const MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg' };

// ---- Storage: songs and playlists live in IndexedDB on the phone, so nothing needs the internet ----
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open('vinilo', 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore('songs', { keyPath: 'id' });
    r.result.createObjectStore('playlists', { keyPath: 'id' });
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function store(name, mode, fn) {
  const db = await dbp;
  return new Promise((res, rej) => {
    const t = db.transaction(name, mode), req = fn(t.objectStore(name));
    t.oncomplete = () => res(req.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
}
const getAll = name => store(name, 'readonly', s => s.getAll());
const put = (name, v) => store(name, 'readwrite', s => s.put(v));
const del = (name, id) => store(name, 'readwrite', s => s.delete(id));

let songs = [], playlists = [], view = { name: 'songs' }, shown = [];
const byId = id => songs.find(s => s.id === id);
const urls = new Map();
const coverUrl = s => urls.get(s.id) || urls.set(s.id, URL.createObjectURL(s.cover)).get(s.id);
const art = (s, cls = '') => s?.cover ? `<div class="art ${cls}" style="background-image:url('${coverUrl(s)}')"></div>` : `<div class="art empty ${cls}"></div>`;
const sortSongs = () => songs.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
const openPlaylist = () => view.name === 'playlist' && playlists.find(p => p.id === view.id);

// ---- Views ----
function render() {
  const pl = openPlaylist();
  if (view.name === 'playlist' && !pl) view = { name: 'playlists' };
  $('#title').textContent = pl ? pl.name : view.name === 'songs' ? 'Canciones' : 'Playlists';
  $('#back').hidden = !pl;
  $('#search').hidden = view.name !== 'songs' || !songs.length;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === (pl ? 'playlists' : view.name)));
  $('#content').innerHTML = pl ? playlistView(pl) : view.name === 'songs' ? songsView() : playlistsView();
}

function list(items) {
  shown = items;
  return `<ul class="list">${items.map((s, i) => `<li class="row${s.id === queue[pos] ? ' playing' : ''}" data-i="${i}" data-id="${s.id}">${art(s)}
    <div class="meta"><b>${esc(s.title)}</b><span>${esc(s.artist || 'Artista desconocido')}${s.album ? ' · ' + esc(s.album) : ''}</span></div>
    <span class="dur">${fmt(s.duration)}</span>
    <button class="icon more" data-more="${i}" aria-label="Opciones de ${esc(s.title)}"><svg class="ic"><use href="#i-more"/></svg></button></li>`).join('')}</ul>`;
}

function songsView() {
  if (!songs.length) return `<div class="empty-state"><h2>Tu biblioteca está vacía</h2>
    <p>Sube tus canciones (MP3, M4A, WAV, FLAC…) desde la app Archivos: iCloud Drive, «En mi iPhone» o una memoria USB. Se guardan en el iPhone y suenan sin internet.</p>
    <button class="btn primary" data-act="add">Añadir música</button></div>`;
  const q = fold($('#search').value.trim());
  return list(q ? songs.filter(s => fold(`${s.title} ${s.artist} ${s.album}`).includes(q)) : songs);
}

function playlistsView() {
  return `<div class="tools"><button class="btn primary" data-act="new-pl">Nueva playlist</button><button class="btn" data-act="import-pl">Importar de Spotify / Apple Music</button></div>` +
    (playlists.length
      ? `<ul class="list">${playlists.map(p => `<li class="row" data-pl="${p.id}">${art(byId(p.songIds[0]))}<div class="meta"><b>${esc(p.name)}</b><span>${p.songIds.length} canciones${p.missing?.length ? ` · faltan ${p.missing.length}` : ''}</span></div></li>`).join('')}</ul>`
      : `<div class="empty-state"><p>Crea una playlist, o importa una que exportaste de Spotify (CSV de Exportify) o de Apple Music/iTunes (Archivo › Biblioteca › Exportar playlist).</p></div>`);
}

function playlistView(p) {
  const items = p.songIds.map(byId);
  const off = items.length ? '' : ' disabled';
  return `<div class="pl-head">${art(items[0], 'big')}<p>${items.length} canciones</p>
    <div class="pl-actions"><button class="btn primary" data-act="play-pl"${off}>Reproducir</button><button class="btn" data-act="shuffle-pl"${off}>Aleatorio</button><button class="btn" data-act="delete-pl">Eliminar</button></div></div>` +
    list(items) +
    (p.missing?.length ? `<h3 class="section-title">No están en tu biblioteca (${p.missing.length}) · súbelas y se añadirán solas</h3>
      <ul class="list missing">${p.missing.map(m => `<li class="row"><div class="art empty"></div><div class="meta"><b>${esc(m.title)}</b><span>${esc(m.artist)}</span></div></li>`).join('')}</ul>` : '');
}

// ---- Small UI helpers ----
function sheet(title, options) {
  const d = $('#sheet');
  d.innerHTML = `<div class="sheet-body"><p>${esc(title)}</p>${options.map((o, i) => `<button data-i="${i}"${o.danger ? ' class="danger"' : ''}>${esc(o.label)}</button>`).join('')}<button class="cancel">Cancelar</button></div>`;
  d.showModal();
  return new Promise(res => {
    d.onclick = e => {
      const b = e.target.closest('button');
      if (!b && e.target !== d) return; // tap inside the sheet but not on a button
      d.close();
      res(b ? options[b.dataset.i]?.value : undefined);
    };
    d.oncancel = () => res(undefined);
  });
}

let toastTimer;
function toast(msg, sticky) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => el.hidden = true, 2500);
}

async function createPlaylist(name, songIds = [], missing = []) {
  const p = { id: crypto.randomUUID(), name, songIds, missing };
  await put('playlists', p);
  playlists.push(p);
  return p;
}

async function deleteSong(s) {
  await del('songs', s.id);
  songs = songs.filter(x => x !== s);
  URL.revokeObjectURL(urls.get(s.id));
  urls.delete(s.id);
  for (const p of playlists) if (p.songIds.includes(s.id)) {
    p.songIds = p.songIds.filter(id => id !== s.id);
    await put('playlists', p);
  }
  dropFromQueue(s.id);
  render();
}

async function songMenu(i) {
  const s = shown[i], p = openPlaylist();
  const choice = await sheet(s.title, [
    { label: 'Añadir a playlist', value: 'add' },
    p && { label: 'Quitar de esta playlist', value: 'remove' },
    { label: 'Eliminar del iPhone', value: 'delete', danger: true },
  ].filter(Boolean));
  if (choice === 'add') {
    const target = await sheet('Añadir a…', [{ label: '+ Nueva playlist', value: 'new' }, ...playlists.map(x => ({ label: x.name, value: x.id }))]);
    let pl = playlists.find(x => x.id === target);
    if (target === 'new') { const name = prompt('Nombre de la playlist')?.trim(); if (name) pl = await createPlaylist(name); }
    if (pl) { pl.songIds.push(s.id); await put('playlists', pl); toast(`Añadida a «${pl.name}»`); render(); }
  } else if (choice === 'remove') {
    p.songIds.splice(i, 1);
    await put('playlists', p);
    render();
  } else if (choice === 'delete' && confirm(`¿Eliminar «${s.title}» de tu biblioteca?`)) await deleteSong(s);
}

const actions = {
  add: () => $('#file-input').click(),
  'import-pl': () => $('#import-input').click(),
  async 'new-pl'() { const name = prompt('Nombre de la playlist')?.trim(); if (name) { await createPlaylist(name); render(); } },
  'play-pl': () => playFrom(shown.map(s => s.id), 0, false),
  'shuffle-pl': () => playFrom(shown.map(s => s.id), Math.floor(Math.random() * shown.length), true),
  async 'delete-pl'() {
    const p = openPlaylist();
    if (!confirm(`¿Eliminar la playlist «${p.name}»? Las canciones siguen en tu biblioteca.`)) return;
    await del('playlists', p.id);
    playlists = playlists.filter(x => x !== p);
    render();
  },
};

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-more],[data-pl],.row[data-i],.tabs button');
  if (!t) return;
  if (t.dataset.view) { view = { name: t.dataset.view }; render(); scrollTo(0, 0); }
  else if (t.dataset.pl) { view = { name: 'playlist', id: t.dataset.pl }; render(); scrollTo(0, 0); }
  else if (t.dataset.more) songMenu(+t.dataset.more);
  else if (t.dataset.act) actions[t.dataset.act]();
  else playFrom(shown.map(s => s.id), +t.dataset.i);
});
$('#add').onclick = actions.add;
$('#back').onclick = () => { view = { name: 'playlists' }; render(); };
$('#search').oninput = render;

// ---- Adding your own files ----
$('#file-input').onchange = async e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  navigator.storage?.persist?.(); // ask the browser never to evict the library
  const added = [], failed = [];
  for (const [n, f] of files.entries()) {
    toast(`Importando ${n + 1} de ${files.length}…`, true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const type = f.type.startsWith('audio/') ? f.type : MIME[f.name.split('.').pop().toLowerCase()] || 'audio/mpeg';
      const song = { id: crypto.randomUUID(), ...readTags(bytes, f.name), duration: 0, added: Date.now(), file: new Blob([bytes], { type }) };
      await put('songs', song);
      songs.push(song);
      added.push(song);
    } catch (err) {
      console.error(f.name, err);
      failed.push(f.name);
    }
  }
  // shortcut: songs that complete an imported playlist are appended at its end, not at their original position.
  for (const p of playlists) {
    if (!p.missing?.length || !added.length) continue;
    const { ids, missing } = matchPlaylist(p.missing, added);
    if (ids.length) { p.songIds.push(...ids); p.missing = missing; await put('playlists', p); }
  }
  sortSongs();
  render();
  toast(failed.length ? `${added.length} añadidas · ${failed.length} no se pudieron guardar (¿falta espacio?)` : `${added.length} canciones añadidas`);
};

// ---- Importing a playlist exported from Spotify / Apple Music ----
$('#import-input').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const b = new Uint8Array(await f.arrayBuffer());
    const enc = b[0] === 0xff && b[1] === 0xfe ? 'utf-16le' : b[0] === 0xfe && b[1] === 0xff ? 'utf-16be' : 'utf-8'; // iTunes exports UTF-16
    const entries = parsePlaylist(new TextDecoder(enc).decode(b));
    const { ids, missing } = matchPlaylist(entries, songs);
    const p = await createPlaylist(f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '), ids, missing);
    view = { name: 'playlist', id: p.id };
    render();
    toast(`${ids.length} de ${entries.length} canciones encontradas en tu biblioteca`);
  } catch (err) {
    alert(`No pude leer ese archivo: ${err.message}`);
  }
};

// ---- Player ----
let base = [], queue = [], pos = -1, shuffle = false, repeat = 'off', srcUrl, seeking = false;
const current = () => byId(queue[pos]);
const shuffled = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function playFrom(ids, i, shuf = shuffle) {
  base = ids;
  shuffle = shuf;
  queue = shuffle ? [ids[i], ...shuffled(ids.filter((_, j) => j !== i))] : ids.slice();
  load(shuffle ? 0 : i);
}

function load(p) {
  pos = p;
  const s = current();
  if (!s) return;
  const old = srcUrl;
  audio.src = srcUrl = URL.createObjectURL(s.file);
  URL.revokeObjectURL(old);
  audio.play().catch(() => {});
  updateNow();
}

function next(auto) {
  if (auto && repeat === 'one') { audio.currentTime = 0; audio.play(); }
  else if (pos + 1 < queue.length) load(pos + 1);
  else if (repeat === 'all' && queue.length) load(0);
}
const prev = () => audio.currentTime > 3 || pos <= 0 ? audio.currentTime = 0 : load(pos - 1);
const toggle = () => current() && (audio.paused ? audio.play() : audio.pause());

function dropFromQueue(id) {
  const cur = queue[pos];
  base = base.filter(x => x !== id);
  queue = queue.filter(x => x !== id);
  if (cur === id) { audio.pause(); audio.removeAttribute('src'); pos = -1; updateNow(); }
  else pos = queue.indexOf(cur);
}

function updateNow() {
  const s = current();
  $('#mini').hidden = !s;
  if (!s) return $('#now').classList.remove('open');
  const bg = s.cover ? `url('${coverUrl(s)}')` : '';
  $('#mini-art').className = `art${s.cover ? '' : ' empty'}`;
  $('#now-art').className = `art big${s.cover ? '' : ' empty'}`;
  for (const el of ['#mini-art', '#now-art', '#now-bg']) $(el).style.backgroundImage = bg;
  $('#mini-title').textContent = $('#now-title').textContent = s.title;
  $('#mini-artist').textContent = $('#now-artist').textContent = s.artist || 'Artista desconocido';
  $('#shuffle').classList.toggle('on', shuffle);
  $('#repeat').classList.toggle('on', repeat !== 'off');
  $('#repeat use').setAttribute('href', repeat === 'one' ? '#i-repeat-one' : '#i-repeat');
  document.querySelectorAll('.row[data-id]').forEach(r => r.classList.toggle('playing', r.dataset.id === s.id));
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({
    title: s.title, artist: s.artist, album: s.album,
    artwork: [s.cover ? { src: coverUrl(s), sizes: '512x512', type: s.cover.type } : { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
  });
}

function updatePlayState() {
  const icon = audio.paused ? '#i-play' : '#i-pause';
  document.querySelectorAll('#mini-play use, #play use').forEach(u => u.setAttribute('href', icon));
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
}

function updateTime() {
  const d = audio.duration || 0, t = seeking ? $('#seek').value / 1000 * d : audio.currentTime;
  $('#mini-progress').style.width = d ? `${t / d * 100}%` : '0';
  if (!seeking) $('#seek').value = d ? t / d * 1000 : 0;
  $('#t-cur').textContent = fmt(t) || '0:00';
  $('#t-dur').textContent = fmt(d) || '0:00';
}

audio.onended = () => next(true);
audio.onplay = audio.onpause = updatePlayState;
audio.ontimeupdate = updateTime;
audio.onloadedmetadata = () => {
  const s = current();
  if (s && !s.duration && isFinite(audio.duration)) {
    s.duration = audio.duration; // learned on first play; avoids decoding every file on import
    put('songs', s);
    const row = document.querySelector(`.row[data-id="${s.id}"] .dur`);
    if (row) row.textContent = fmt(s.duration);
  }
  updateTime();
};

$('#mini').onclick = () => $('#now').classList.add('open');
$('#mini-play').onclick = e => { e.stopPropagation(); toggle(); };
$('#now-close').onclick = () => $('#now').classList.remove('open');
$('#play').onclick = toggle;
$('#next').onclick = () => next();
$('#prev').onclick = prev;
$('#shuffle').onclick = () => {
  const cur = queue[pos];
  shuffle = !shuffle;
  if (cur) {
    queue = shuffle ? [cur, ...shuffled(base.filter(id => id !== cur))] : base.slice();
    pos = queue.indexOf(cur);
  }
  updateNow();
};
$('#repeat').onclick = () => { repeat = { off: 'all', all: 'one', one: 'off' }[repeat]; updateNow(); };
$('#seek').oninput = () => { seeking = true; updateTime(); };
$('#seek').onchange = () => { audio.currentTime = $('#seek').value / 1000 * (audio.duration || 0); seeking = false; };

if ('mediaSession' in navigator) { // lock screen and Control Center buttons
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => audio.play());
  ms.setActionHandler('pause', () => audio.pause());
  ms.setActionHandler('previoustrack', prev);
  ms.setActionHandler('nexttrack', () => next());
  ms.setActionHandler('seekto', e => { audio.currentTime = e.seekTime; });
}

[songs, playlists] = await Promise.all([getAll('songs'), getAll('playlists')]);
sortSongs();
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
