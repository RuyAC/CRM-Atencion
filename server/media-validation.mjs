// Structural container checks. Playback/codec support is still browser-dependent.
export function validVideo(data, mime) {
  if (mime === 'video/webm') {
    if (data.length < 16 || data.readUInt32BE(0) !== 0x1a45dfa3) return false;
    return data.includes(Buffer.from('webm')) && data.includes(Buffer.from([0x18,0x53,0x80,0x67]));
  }
  let offset = 0, brand = false, metadata = false, media = false;
  while (offset + 8 <= data.length) {
    let size = data.readUInt32BE(offset), header = 8;
    const type = data.toString('ascii', offset + 4, offset + 8);
    if (size === 1) {
      if (offset + 16 > data.length) return false;
      const extended = data.readBigUInt64BE(offset + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) return false;
      size = Number(extended); header = 16;
    } else if (size === 0) size = data.length - offset;
    if (size < header || offset + size > data.length) return false;
    if (type === 'ftyp' && size >= header + 8) {
      const brands = data.toString('ascii', offset + header, offset + size);
      brand = /isom|iso[2-9]|mp4[12]|avc1|M4V |qt  |dash/.test(brands);
    }
    if (type === 'moov') metadata = size > header;
    if (type === 'mdat') media = size > header;
    offset += size;
  }
  return offset === data.length && brand && metadata && media;
}
