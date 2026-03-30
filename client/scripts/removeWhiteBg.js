/**
 * Removes near-white backgrounds from PNG sign images.
 * Uses fast-png (already installed) — no extra deps needed.
 * Run: node scripts/removeWhiteBg.js
 */
const fs = require("fs");
const path = require("path");
const { decode, encode } = require("fast-png");

const SIGNS_DIR = path.join(__dirname, "../public/signs");
const THRESHOLD = 240; // pixels with R,G,B all > this become transparent

const pngFiles = fs.readdirSync(SIGNS_DIR).filter((f) => f.endsWith(".png"));

for (const file of pngFiles) {
  const filePath = path.join(SIGNS_DIR, file);
  const buf = fs.readFileSync(filePath);
  const img = decode(buf);

  // Ensure RGBA
  let data = img.data;
  let channels = img.channels ?? (data.length / (img.width * img.height));
  let rgba;

  if (channels === 4) {
    rgba = new Uint8Array(data);
  } else if (channels === 3) {
    // Convert RGB → RGBA
    rgba = new Uint8Array(img.width * img.height * 4);
    for (let i = 0; i < img.width * img.height; i++) {
      rgba[i * 4]     = data[i * 3];
      rgba[i * 4 + 1] = data[i * 3 + 1];
      rgba[i * 4 + 2] = data[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else {
    console.log(`  skipped ${file} (unsupported channels: ${channels})`);
    continue;
  }

  let changed = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (r > THRESHOLD && g > THRESHOLD && b > THRESHOLD) {
      rgba[i + 3] = 0; // transparent
      changed++;
    }
  }

  if (changed === 0) {
    console.log(`  ${file}: no white pixels found, skipped`);
    continue;
  }

  const out = encode({ width: img.width, height: img.height, data: rgba, channels: 4, depth: 8 });
  fs.writeFileSync(filePath, Buffer.from(out));
  console.log(`  ${file}: removed ${changed} white pixels ✓`);
}
console.log("Done.");
