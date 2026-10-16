// Image validation from the actual bytes (never trusts the file name or the browser's claim).

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB request bodies
export const MAX_SIDE = 6000;

/** Returns {mime, width, height} or null when the bytes are not a supported image. */
export function sniffImage(b) {
  if (!Buffer.isBuffer(b) || b.length < 32) return null;
  // PNG
  if (b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString('ascii', 12, 16) === 'IHDR')
    return { mime: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  // GIF
  const sig = b.toString('ascii', 0, 6);
  if (sig === 'GIF87a' || sig === 'GIF89a')
    return { mime: 'image/gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  // WEBP
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8 ' && b.length >= 30)
      return { mime: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L' && b.length >= 25) {
      const bits = b.readUInt32LE(21);
      return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X' && b.length >= 30)
      return { mime: 'image/webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    return null;
  }
  // JPEG: walk the markers until a start-of-frame
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { mime: 'image/jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/** Returns {mime, width:0, height:0} for MP3, OGG, WAV or M4A audio, else null. */
export function sniffAudio(b) {
  if (!Buffer.isBuffer(b) || b.length < 32) return null;
  const a = (i, j) => b.toString('ascii', i, j);
  let mime = null;
  if (a(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0)) mime = 'audio/mpeg';
  else if (a(0, 4) === 'OggS') mime = 'audio/ogg';
  else if (a(0, 4) === 'RIFF' && a(8, 12) === 'WAVE') mime = 'audio/wav';
  else if (a(4, 8) === 'ftyp' && ['M4A ', 'M4B ', 'mp42', 'isom', 'iso2', 'dash'].includes(a(8, 12))) mime = 'audio/mp4';
  return mime ? { mime, width: 0, height: 0 } : null;
}

export const isAudio = mime => String(mime).startsWith('audio/');

export const mediaUrl = (id, version) => `/api/media?id=${id}&v=${version}`;
