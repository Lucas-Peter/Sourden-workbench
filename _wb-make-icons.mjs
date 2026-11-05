// 生成 PWA 图标（192 / 512 / 180 苹果图标）：橙色圆角方块 + 白色对勾
// 不依赖任何图像库：直接写像素 + 手写 PNG 编码（zlib）。用法：node _wb-make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'public');
const ORANGE = [249, 115, 22];
const ORANGE_DEEP = [234, 88, 12];
const WHITE = [255, 255, 255];

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 点到线段距离平方
function segDist2(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.22;                      // 圆角半径
  const stroke = size * 0.085;                // 对勾线宽
  const tick = [
    [size * 0.29, size * 0.52, size * 0.44, size * 0.67],
    [size * 0.44, size * 0.67, size * 0.72, size * 0.35],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // 圆角矩形内部判定
      const cx = Math.min(Math.max(x + 0.5, r), size - r);
      const cy = Math.min(Math.max(y + 0.5, r), size - r);
      const inRect = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;
      if (!inRect) { px[i + 3] = 0; continue; }
      // 渐变：从左上到右下
      const k = (x + y) / (size * 2);
      let c = [
        Math.round(ORANGE[0] * (1 - k) + ORANGE_DEEP[0] * k),
        Math.round(ORANGE[1] * (1 - k) + ORANGE_DEEP[1] * k),
        Math.round(ORANGE[2] * (1 - k) + ORANGE_DEEP[2] * k),
      ];
      // 对勾（抗锯齿：按距离做一点羽化）
      let d = Infinity;
      for (const [x1, y1, x2, y2] of tick) d = Math.min(d, segDist2(x + 0.5, y + 0.5, x1, y1, x2, y2));
      const dist = Math.sqrt(d) - stroke / 2;
      if (dist < 0.5) {
        const a = dist <= -0.5 ? 1 : 0.5 - dist;
        c = [0, 1, 2].map((j) => Math.round(c[j] * (1 - a) + WHITE[j] * a));
      }
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }
  return png(size, px);
}

for (const size of [192, 512, 180]) {
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  const buf = draw(size);
  writeFileSync(join(DIR, name), buf);
  console.log(name, buf.length, 'bytes');
}
