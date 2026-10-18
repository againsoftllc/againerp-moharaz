/**
 * Adds one file to an existing .zip (as stored / uncompressed) without a zip library: the new entry is put in front of the
 * central directory, which is rewritten with one more record. Works for ordinary zips (no zip64, no encryption) such as the one
 * scripts/pack_browser_extension.py writes. Used to put the admin's own addresses (config.json) into the extension download.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function addFileToZip(zip: Uint8Array, path: string, content: Uint8Array): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // end-of-central-directory record: the last 22+ bytes, signature 0x06054b50
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file");
  const entries = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  const comment = zip.subarray(eocd + 22);

  const name = new TextEncoder().encode(path);
  const crc = crc32(content);
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const local = new Uint8Array(30 + name.length + content.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(4, 20, true); // version needed
  lv.setUint16(6, 0x0800, true); // UTF-8 name
  lv.setUint16(8, 0, true); // stored
  lv.setUint16(10, dosTime, true);
  lv.setUint16(12, dosDate, true);
  lv.setUint32(14, crc, true);
  lv.setUint32(18, content.length, true);
  lv.setUint32(22, content.length, true);
  lv.setUint16(26, name.length, true);
  lv.setUint16(28, 0, true);
  local.set(name, 30);
  local.set(content, 30 + name.length);

  const central = new Uint8Array(46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(4, 20, true); // version made by
  cv.setUint16(6, 20, true); // version needed
  cv.setUint16(8, 0x0800, true);
  cv.setUint16(10, 0, true);
  cv.setUint16(12, dosTime, true);
  cv.setUint16(14, dosDate, true);
  cv.setUint32(16, crc, true);
  cv.setUint32(20, content.length, true);
  cv.setUint32(24, content.length, true);
  cv.setUint16(28, name.length, true);
  cv.setUint32(42, cdOffset, true); // where the local record starts (= where the old central directory started)
  central.set(name, 46);

  const end = new Uint8Array(22 + comment.length);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries + 1, true);
  ev.setUint16(10, entries + 1, true);
  ev.setUint32(12, cdSize + central.length, true);
  ev.setUint32(16, cdOffset + local.length, true);
  ev.setUint16(20, comment.length, true);
  end.set(comment, 22);

  const out = new Uint8Array(cdOffset + local.length + cdSize + central.length + end.length);
  let pos = 0;
  for (const part of [zip.subarray(0, cdOffset), local, zip.subarray(cdOffset, cdOffset + cdSize), central, end]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}
