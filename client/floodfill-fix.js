const fastPng = require('./node_modules/fast-png/lib/index.js');
const fs = require('fs');

const signsDir = 'public/signs';

const needsFloodFill = [
  'C-002-1.svg','C-002-1OL.svg','C-008-1.svg','C-008-2.svg','C-016.svg',
  'C-027.svg','C-033.svg','C-034.svg','C-037-2.svg','C-039.svg','C-043.svg',
  'C-048-2.svg','C-050-1.svg','C-080-Ta.svg','C-086-1.svg','C-088.svg',
  'C-089.svg','C-090.svg','C-172-T.svg','C-202.svg','C-203-L.svg','C-203-R.svg',
  'P-081-1.svg','P-081-2.svg','P-081-Ta.svg','P-081-Tb.svg','P-081-Tc.svg',
  'R-001-Ta.svg','R-001-Tb.svg','R-001-Tc.svg','R-001.svg','R-002.svg',
  'R-003.svg','R-004.svg','R-010.svg','R-012-T.svg','R-012.svg',
  'R-014-L.svg','R-014-R.svg','R-015-L.svg','R-015-R.svg',
  'R-016-2.svg','R-016-2R.svg','R-017-2.svg','R-018.svg'
];

function floodFillRestoreWhite(svgFile) {
  const svgPath = signsDir + '/' + svgFile;
  let svg = fs.readFileSync(svgPath, 'utf8');
  
  // Find all PNG images in SVG (first = mask def, second = content)
  const allMatches = [...svg.matchAll(/xlink:href="data:image\/png;base64,([^"]+)"/g)];
  if (allMatches.length < 2) {
    console.log('SKIP (< 2 PNGs):', svgFile);
    return;
  }
  
  // Content image is always the second one
  const contentIdx = 1;
  const origBase64 = allMatches[contentIdx][1];
  const buf = Buffer.from(origBase64, 'base64');
  const png = fastPng.decode(buf);
  const { width: w, height: h, channels: ch } = png;
  const d = new Uint8Array(png.data);
  
  if (ch < 4) {
    // Not RGBA — no transparent pixels to restore
    console.log('SKIP (not RGBA, ch=' + ch + '):', svgFile);
    return;
  }
  
  // BFS flood fill from border pixels with alpha=0
  const visited = new Uint8Array(w * h); // 0=not visited, 1=exterior
  const queue = new Int32Array(w * h);
  let qHead = 0, qTail = 0;
  
  function tryAdd(pi) {
    if (!visited[pi] && d[pi * ch + 3] === 0) {
      visited[pi] = 1;
      queue[qTail++] = pi;
    }
  }
  
  // Seed from all 4 borders
  for (let x = 0; x < w; x++) { tryAdd(0 * w + x); tryAdd((h-1) * w + x); }
  for (let y = 0; y < h; y++) { tryAdd(y * w + 0); tryAdd(y * w + (w-1)); }
  
  while (qHead < qTail) {
    const pi = queue[qHead++];
    const x = pi % w, y = (pi / w) | 0;
    if (x > 0)   tryAdd(pi - 1);
    if (x < w-1) tryAdd(pi + 1);
    if (y > 0)   tryAdd(pi - w);
    if (y < h-1) tryAdd(pi + w);
  }
  
  // Interior transparent pixels → white opaque
  let restored = 0;
  for (let i = 0; i < w * h; i++) {
    if (d[i * ch + 3] === 0 && !visited[i]) {
      d[i * ch + 0] = 255; // R
      d[i * ch + 1] = 255; // G
      d[i * ch + 2] = 255; // B
      d[i * ch + 3] = 255; // A
      restored++;
    }
  }
  
  if (restored === 0) {
    console.log('NO INTERIOR TRANSPARENT (skip):', svgFile);
    return;
  }
  
  // Re-encode PNG
  const newPngBuf = fastPng.encode({ ...png, data: d });
  const newBase64 = Buffer.from(newPngBuf).toString('base64');
  
  // Replace in SVG — replace the SECOND occurrence (content image)
  // Build replacement by finding second occurrence of base64 data
  let occ = 0;
  const newSvg = svg.replace(/xlink:href="data:image\/png;base64,([^"]+)"/g, (match, b64) => {
    occ++;
    if (occ === 2) return 'xlink:href="data:image/png;base64,' + newBase64 + '"';
    return match;
  });
  
  // Also ensure white rect is removed (should already be done)
  const finalSvg = newSvg.replace(/<rect[^>]*fill="white"[^>]*\/>/g, '');
  
  fs.writeFileSync(svgPath, finalSvg, 'utf8');
  console.log('FIXED (restored ' + restored + ' interior white px):', svgFile);
}

let done = 0, errors = 0;
for (const f of needsFloodFill) {
  try {
    floodFillRestoreWhite(f);
    done++;
  } catch(e) {
    console.error('ERROR', f, ':', e.message);
    errors++;
  }
}
console.log('\nDone:', done, 'Errors:', errors);
