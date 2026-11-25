// elevation.mjs — ground height (metres) anywhere on the map, for contour lines.
// Uses the free "Terrarium" elevation tiles from AWS Open Data (made by Mapzen from
// SRTM and other public sources). Each tile is a 256×256 PNG; a pixel's colour
// holds its height: (red × 256 + green + blue / 256) − 32768 metres.
// Tiles are downloaded once into tools/cache/terrain/. Build-time only.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

const ZOOM = 9;
const URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

// Read an 8-bit, non-interlaced RGB or RGBA PNG into { width, height, channels, data }.
function decodePng(buf) {
  let pos = 8; let width = 0; let height = 0; let colorType = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error('Unsupported PNG (needs 8-bit, not interlaced)');
      colorType = body[9];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error('Unsupported PNG colour type ' + colorType);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  // Undo the PNG row filters (none, sub, up, average, Paeth).
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[y * stride + i - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= channels ? out[(y - 1) * stride + i - channels] : 0;
      let v = row[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + i] = v & 255;
    }
  }
  return { width, height, channels, data: out };
}

const tileX = (lon) => ((lon + 180) / 360) * 2 ** ZOOM;
const tileY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** ZOOM;
};

// Download (once) every tile covering [south, west, north, east] and return a
// function height(lon, lat) in metres.
export async function loadElevation(cacheDir, [south, west, north, east]) {
  mkdirSync(cacheDir, { recursive: true });
  const x0 = Math.floor(tileX(west)); const x1 = Math.floor(tileX(east));
  const y0 = Math.floor(tileY(north)); const y1 = Math.floor(tileY(south));
  const tiles = new Map();
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const file = join(cacheDir, `${ZOOM}-${x}-${y}.png`);
      if (!existsSync(file)) {
        const res = await fetch(`${URL}/${ZOOM}/${x}/${y}.png`);
        if (!res.ok) throw new Error(`Elevation tile ${x},${y} failed: ${res.status}`);
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      }
      tiles.set(`${x},${y}`, decodePng(readFileSync(file)));
    }
  }
  // Height of one tile pixel (global pixel coordinates at this zoom).
  const pixel = (px, py) => {
    const tx = Math.floor(px / 256); const ty = Math.floor(py / 256);
    const t = tiles.get(`${tx},${ty}`);
    if (!t) return 0;
    const i = ((py - ty * 256) * t.width + (px - tx * 256)) * t.channels;
    return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
  };
  // Smooth (bilinear) height at any point.
  return (lon, lat) => {
    const gx = tileX(lon) * 256 - 0.5; const gy = tileY(lat) * 256 - 0.5;
    const ix = Math.floor(gx); const iy = Math.floor(gy); const fx = gx - ix; const fy = gy - iy;
    const a = pixel(ix, iy) * (1 - fx) + pixel(ix + 1, iy) * fx;
    const b = pixel(ix, iy + 1) * (1 - fx) + pixel(ix + 1, iy + 1) * fx;
    return Math.max(0, a * (1 - fy) + b * fy);
  };
}
