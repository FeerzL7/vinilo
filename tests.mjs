// Self-check for the tag reader and playlist import. Run: node tests.mjs
import assert from 'node:assert/strict';
import { readTags, fromFilename } from './metadata.js';
import { parsePlaylist, matchPlaylist } from './playlist-import.js';

const bytes = (s, enc = 'utf8') => [...Buffer.from(s, enc)];
const be32 = n => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];

// MP3 with an ID3v2.3 tag: latin1 title, UTF-8 artist, JPEG cover
const frame = (id, body) => [...bytes(id), ...be32(body.length), 0, 0, ...body];
const jpeg = [0xff, 0xd8, 0xff, 0xd9];
const frames = [...frame('TIT2', [0, ...bytes('Canción', 'latin1')]), ...frame('TPE1', [3, ...bytes('Artista Ñ')]), ...frame('APIC', [0, ...bytes('image/jpeg'), 0, 3, 0, ...jpeg])];
const n = frames.length;
const mp3 = new Uint8Array([...bytes('ID3'), 3, 0, 0, (n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127, ...frames, 0, 0, 0xff, 0xfb]);
let t = readTags(mp3, 'cualquiera.mp3');
assert.equal(t.title, 'Canción');
assert.equal(t.artist, 'Artista Ñ');
assert.equal(t.cover.type, 'image/jpeg');
assert.deepEqual([...new Uint8Array(await t.cover.arrayBuffer())], jpeg);

// M4A with iTunes-style tags, moov placed after mdat
const atom = (type, ...kids) => { const body = kids.flat(); return [...be32(body.length + 8), ...bytes(type, 'latin1'), ...body]; };
const data = (flag, body) => atom('data', [0, 0, 0, flag, 0, 0, 0, 0, ...body]);
const m4a = new Uint8Array([
  ...atom('ftyp', bytes('M4A '), [0, 0, 0, 0]), ...atom('mdat', [1, 2, 3]),
  ...atom('moov', atom('udta', atom('meta', [0, 0, 0, 0], atom('hdlr', new Array(25).fill(0)),
    atom('ilst', atom('\xa9nam', data(1, bytes('Título'))), atom('\xa9ART', data(1, bytes('Grupo'))), atom('covr', data(14, [137, 80])))))),
]);
t = readTags(m4a, 'x.m4a');
assert.deepEqual([t.title, t.artist, t.cover.type], ['Título', 'Grupo', 'image/png']);

// No tags: the file name is used
assert.deepEqual(readTags(new Uint8Array(64), 'Daft Punk - One More Time.wav').title, 'One More Time');
assert.deepEqual(fromFilename('01 Daft Punk - One More Time.mp3'), { artist: 'Daft Punk', title: 'One More Time' });
assert.deepEqual(fromFilename('50 Cent - In Da Club.m4a'), { artist: '50 Cent', title: 'In Da Club' });

// Exportify (Spotify) CSV, with quoted commas and an "Artist URI(s)" column to skip
const csv = 'Track URI,Track Name,Artist URI(s),Artist Name(s),Album Name\r\n' +
  'spotify:track:1,Tití Me Preguntó,spotify:artist:1,Bad Bunny,Un Verano Sin Ti\r\n' +
  'spotify:track:2,"Hello, World - Remastered 2011","a,b","Foo,Bar",X\r\n';
assert.deepEqual(parsePlaylist(csv), [{ title: 'Tití Me Preguntó', artist: 'Bad Bunny' }, { title: 'Hello, World - Remastered 2011', artist: 'Foo,Bar' }]);

// Apple Music / iTunes text export (tab separated)
assert.deepEqual(parsePlaylist('﻿Name\tArtist\tComposer\tAlbum\nBohemian Rhapsody\tQueen\t\tA Night at the Opera\n'), [{ title: 'Bohemian Rhapsody', artist: 'Queen' }]);

// M3U, with and without #EXTINF
assert.deepEqual(parsePlaylist('#EXTM3U\n#EXTINF:354,Queen - Bohemian Rhapsody\nC:\\Music\\a.mp3\nD:\\Music\\The Killers - Mr. Brightside.mp3\n'),
  [{ artist: 'Queen', title: 'Bohemian Rhapsody' }, { artist: 'The Killers', title: 'Mr. Brightside' }]);

// Matching ignores accents, "- Remastered" suffixes, and swapped "Title - Artist" order
const lib = [{ id: 'a', title: 'Titi Me Pregunto', artist: 'Bad Bunny' }, { id: 'b', title: 'Hello, World', artist: 'Foo' }, { id: 'c', title: 'Bohemian Rhapsody', artist: '' }];
const r = matchPlaylist([...parsePlaylist(csv), { title: 'Queen', artist: 'Bohemian Rhapsody' }, { title: 'Nope', artist: 'X' }, { title: 'Hello, World', artist: 'Someone Else' }], lib);
assert.deepEqual(r.ids, ['a', 'b', 'c']);
assert.deepEqual(r.missing.map(m => m.title), ['Nope', 'Hello, World']);

console.log('ok');
