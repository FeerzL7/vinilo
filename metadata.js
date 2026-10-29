// Reads title/artist/album/cover from ID3v2 (MP3) or iTunes-style MP4 tags (M4A/AAC).
// Anything else (WAV, FLAC, OGG...) falls back to the file name: "Artista - Título.ext".
export function readTags(b, fileName) {
  const tags = b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33 ? id3(b)
    : ascii(b, 4, 8) === 'ftyp' ? mp4(b) : {};
  const guess = fromFilename(fileName);
  return { title: tags.title || guess.title, artist: tags.artist || guess.artist, album: tags.album || '', cover: tags.cover || null };
}

export function fromFilename(name) {
  const base = name.split(/[\\/]/).pop().replace(/\.[a-z0-9]{2,5}$/i, '').replace(/^(0\d|\d{1,3}\.)[\s.\-_]*/, '').trim();
  return splitArtistTitle(base);
}

export function splitArtistTitle(s) {
  const i = s.indexOf(' - ');
  return i > 0 ? { artist: s.slice(0, i).trim(), title: s.slice(i + 3).trim() } : { artist: '', title: s.trim() };
}

const ascii = (b, from, to) => String.fromCharCode(...b.subarray(from, to));

// shortcut: ignores tag-level unsynchronisation (rare in real files); upgrade if covers come out corrupted.
function id3(b) {
  const v = b[3], out = {};
  const syncsafe = i => (b[i] << 21) | (b[i + 1] << 14) | (b[i + 2] << 7) | b[i + 3];
  const int = (i, n) => { let x = 0; for (let k = 0; k < n; k++) x = x * 256 + b[i + k]; return x; };
  const end = Math.min(b.length, 10 + syncsafe(6));
  let p = 10;
  if (b[5] & 0x40) p += v === 4 ? syncsafe(10) : int(10, 4) + 4; // extended header
  const idLen = v === 2 ? 3 : 4, hdr = v === 2 ? 6 : 10;
  while (p + hdr < end) {
    const id = ascii(b, p, p + idLen);
    const size = v === 2 ? int(p + 3, 3) : v === 4 ? syncsafe(p + 4) : int(p + 4, 4);
    if (!/^[A-Z0-9]+$/.test(id) || size <= 0) break; // reached padding
    const d = b.subarray(p + hdr, Math.min(end, p + hdr + size));
    const key = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album' }[id];
    if (key) out[key] ||= text(d[0], d.subarray(1));
    else if ((id === 'APIC' || id === 'PIC') && !out.cover) out.cover = picture(d, v === 2);
    p += hdr + size;
  }
  return out;
}

function text(enc, d) {
  const label = enc === 1 ? (d[0] === 0xfe ? 'utf-16be' : 'utf-16le') : enc === 2 ? 'utf-16be' : enc === 3 ? 'utf-8' : 'latin1';
  return new TextDecoder(label).decode(d).replace(/﻿/g, '').split('\0').filter(Boolean).join(', ').trim();
}

function picture(d, v2) {
  const enc = d[0];
  let mime, p;
  if (v2) { mime = 'image/' + ascii(d, 1, 4).toLowerCase().replace('jpg', 'jpeg'); p = 5; }
  else { const z = d.indexOf(0, 1); mime = ascii(d, 1, z) || 'image/jpeg'; p = z + 2; }
  // skip the description: ends in 0, or 00 00 for UTF-16
  if (enc === 1 || enc === 2) { while (p + 1 < d.length && (d[p] || d[p + 1])) p += 2; p += 2; }
  else { while (p < d.length && d[p]) p++; p++; }
  return new Blob([d.slice(p)], { type: mime.includes('/') ? mime : 'image/' + mime });
}

function mp4(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), out = {};
  const keys = { '\xa9nam': 'title', '\xa9ART': 'artist', '\xa9alb': 'album', covr: 'cover' };
  const walk = (s, e, inList) => {
    while (s + 8 <= e) {
      let size = dv.getUint32(s), hdr = 8;
      const type = ascii(b, s + 4, s + 8);
      if (size === 1) { size = Number(dv.getBigUint64(s + 8)); hdr = 16; } else if (size === 0) size = e - s;
      if (size < hdr || s + size > e) return;
      const body = s + hdr;
      if (inList) {
        const key = keys[type];
        if (key && body + 16 <= s + size && ascii(b, body + 4, body + 8) === 'data') {
          const flag = dv.getUint32(body + 8) & 0xffffff;
          const payload = b.subarray(body + 16, body + dv.getUint32(body));
          out[key] = key === 'cover' ? new Blob([payload.slice()], { type: flag === 14 ? 'image/png' : 'image/jpeg' }) : new TextDecoder().decode(payload);
        }
      } else if (type === 'moov' || type === 'udta') walk(body, s + size, false);
      else if (type === 'meta') walk(body + 4, s + size, false); // meta is a "full box": 4 bytes of version/flags first
      else if (type === 'ilst') walk(body, s + size, true);
      s += size;
    }
  };
  walk(0, b.length, false);
  return out;
}
