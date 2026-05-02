import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const src = './public/logo-source.png.png';
const outDir = './public';

async function generate() {
  const meta = await sharp(src).metadata();
  console.log(`Source: ${meta.width}x${meta.height}`);

  // Use the full logo exactly as-is — no cropping
  const sizes = [
    { size: 16,  name: 'favicon-16x16.png' },
    { size: 32,  name: 'favicon-32x32.png' },
    { size: 48,  name: 'favicon-48x48.png' },
    { size: 180, name: 'apple-touch-icon.png' },
  ];

  for (const { size, name } of sizes) {
    await sharp(src)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(path.join(outDir, name));
    console.log(`✓ ${name} (${size}x${size})`);
  }

  // favicon.ico — 16, 32, 48
  const bufs = await Promise.all([16, 32, 48].map(sz =>
    sharp(src)
      .resize(sz, sz, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer()
  ));
  const icoBuffer = buildIco([
    { size: 16, data: bufs[0] },
    { size: 32, data: bufs[1] },
    { size: 48, data: bufs[2] },
  ]);
  fs.writeFileSync(path.join(outDir, 'favicon.ico'), icoBuffer);
  console.log('✓ favicon.ico (16/32/48)');
  console.log('\n✅ Done!');
}

function buildIco(images) {
  const count = images.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const offsets = images.map(img => { const o = offset; offset += img.data.length; return o; });
  const buf = Buffer.alloc(offset);
  buf.writeUInt16LE(0, 0); buf.writeUInt16LE(1, 2); buf.writeUInt16LE(count, 4);
  images.forEach((img, i) => {
    const base = 6 + i * 16;
    const sz = img.size === 256 ? 0 : img.size;
    buf.writeUInt8(sz, base); buf.writeUInt8(sz, base + 1);
    buf.writeUInt8(0, base + 2); buf.writeUInt8(0, base + 3);
    buf.writeUInt16LE(1, base + 4); buf.writeUInt16LE(32, base + 6);
    buf.writeUInt32LE(img.data.length, base + 8);
    buf.writeUInt32LE(offsets[i], base + 12);
  });
  images.forEach((img, i) => img.data.copy(buf, offsets[i]));
  return buf;
}

generate().catch(console.error);
