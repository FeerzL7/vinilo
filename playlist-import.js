// Turns playlist exports into [{ title, artist }] and matches them against the songs on the phone.
// Supported: Exportify CSV (Spotify), Music/iTunes "Text" export (Apple Music) and M3U/M3U8.
import { fromFilename, splitArtistTitle } from './metadata.js';

export function parsePlaylist(text) {
  text = text.replace(/^﻿/, '');
  if (/^#EXT(M3U|INF)/m.test(text)) return parseM3U(text);
  const rows = parseDelimited(text, text.split('\n', 1)[0].includes('\t') ? '\t' : ',');
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
  const ti = head.findIndex(h => /^(track name|name|title|song|nombre|título|titulo|canción|cancion)$/.test(h));
  const ai = head.findIndex(h => /artist/.test(h) && !/uri|id\b/.test(h));
  if (ti < 0) throw new Error('no encuentro la columna con el nombre de la canción');
  return rows.filter(r => r[ti]?.trim()).map(r => ({ title: r[ti].trim(), artist: (r[ai] || '').trim() }));
}

function parseDelimited(text, sep) {
  const rows = [[]];
  let f = '', quoted = false;
  const endField = () => { rows.at(-1).push(f.replace(/\r$/, '')); f = ''; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') f += c;
      else if (text[i + 1] === '"') { f += '"'; i++; }
      else quoted = false;
    } else if (c === '"' && sep === ',' && f === '') quoted = true; // tab exports are never quoted
    else if (c === sep) endField();
    else if (c === '\n') { endField(); rows.push([]); }
    else f += c;
  }
  endField();
  return rows.filter(r => r.some(x => x.trim()));
}

function parseM3U(text) {
  const out = [];
  let info = '';
  for (const line of text.split(/\r?\n/).map(l => l.trim())) {
    if (line.startsWith('#EXTINF')) info = line.slice(line.indexOf(',') + 1).trim();
    else if (line && !line.startsWith('#')) { out.push(info ? splitArtistTitle(info) : fromFilename(line)); info = ''; }
  }
  return out;
}

// Loose comparison: accents, "(feat. X)", "[Live]", " - Remastered 2011" and punctuation are ignored.
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\s-\s.*$/, ' ').replace(/\b(feat|ft)\b.*$/, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();

function sameArtist(wanted, local) {
  local = norm(local);
  if (!wanted || !local) return true; // unknown artist on either side: trust the title
  return wanted.split(/,|;|&|\/|\bfeat\.?|\bft\.?|\sx\s|\sy\s/i).map(norm).some(p => p && (local.includes(p) || p.includes(local)));
}

export function matchPlaylist(entries, songs) {
  const lib = songs.map(s => [s, norm(s.title)]);
  const ids = [], missing = [];
  for (const e of entries) {
    const t = norm(e.title), a = norm(e.artist);
    const hit = (t && lib.find(([s, n]) => n === t && sameArtist(e.artist, s.artist)))
      || (a && lib.find(([s, n]) => n === a && sameArtist(e.title, s.artist))); // some M3U files say "Title - Artist"
    hit ? ids.push(hit[0].id) : missing.push(e);
  }
  return { ids, missing };
}
