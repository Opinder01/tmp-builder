const fs = require("fs");
const path = require("path");
const { decode, encode } = require("fast-png");

const SIGNS_DIR = path.join(__dirname, "../public/signs");
const THRESHOLD = 240;

const pngFiles = fs.readdirSync(SIGNS_DIR).filter(f => f.endsWith(".png"));

for (const file of pngFiles) {
  const filePath = path.join(SIGNS_DIR, file);
  const buf = fs.readFileSync(filePath);
  const img = decode(buf);

  const channels = img.channels ?? (img.data.length / (img.width * img.height));
  let rgba;

  if (channels === 4) {
    rgba = new Uint8Array(img.data);
  } else if (channels === 3) {
    rgba = new Uint8Array(img.width * img.height * 4);
    for (let i = 0; i < img.width * img.height; i++) {
      rgba[i*4]   = img.data[i*3];
      rgba[i*4+1] = img.data[i*3+1];
      rgba[i*4+2] = img.data[i*3+2];
      rgba[i*4+3] = 255;
    }
  } else {
    console.log(`  skipped ${file} (channels: ${channels})`);
    continue;
  }

  let changed = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] > THRESHOLD && rgba[i+1] > THRESHOLD && rgba[i+2] > THRESHOLD) {
      rgba[i+3] = 0;
      changed++;
    }
  }

  if (changed === 0) { console.log(`  ${file}: no white pixels — skipped`); continue; }

  const out = encode({ width: img.width, height: img.height, data: rgba, channels: 4, depth: 8 });
  fs.writeFileSync(filePath, Buffer.from(out));
  console.log(`  ${file}: ✓ removed ${changed} white pixels`);
}
console.log("Done.");
