const fs = require('fs');
const path = require('path');
const xml = require('fast-xml-parser');

const signsDir = './public/signs';
const files = fs.readdirSync(signsDir).filter(f => f.endsWith('.svg'));

const results = {
  withWhiteRects: [],
  noWhiteRects: [],
  details: []
};

files.forEach(file => {
  const filePath = path.join(signsDir, file);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for white rects
    const hasWhiteRect = content.includes('fill="white"') || content.includes('fill=\'white\'') || 
                         content.includes('#FFFFFF') || content.includes('#ffffff');
    
    // Extract clip-path and mask info
    const clipPathMatch = content.match(/clipPath[^>]*id="([^"]+)"/);
    const maskMatch = content.match(/mask[^>]*id="([^"]+)"/);
    const rectMatch = content.match(/<rect[^>]*fill="white"[^>]*>/);
    
    const detail = {
      file,
      hasWhiteRect,
      clipPathId: clipPathMatch ? clipPathMatch[1] : null,
      maskId: maskMatch ? maskMatch[1] : null,
      hasWhiteRectElement: !!rectMatch
    };
    
    // Try to extract clip-path rectangle dimensions
    if (clipPathMatch) {
      const clipId = clipPathMatch[1];
      const clipPathRegex = new RegExp(`<clipPath[^>]*id="${clipId}"[^>]*>.*?</clipPath>`, 's');
      const clipPathContent = clipPathRegex.exec(content);
      if (clipPathContent) {
        const rectInClip = clipPathContent[0].match(/<rect[^>]*>/);
        if (rectInClip) {
          detail.clipPathRect = rectInClip[0];
        }
      }
    }
    
    results.details.push(detail);
    
    if (hasWhiteRect) {
      results.withWhiteRects.push(file);
    } else {
      results.noWhiteRects.push(file);
    }
  } catch (e) {
    console.error(`Error processing ${file}:`, e.message);
  }
});

console.log(`\n=== SUMMARY ===`);
console.log(`Total SVG files: ${files.length}`);
console.log(`Files with white fill: ${results.withWhiteRects.length}`);
console.log(`Files without white fill: ${results.noWhiteRects.length}`);

console.log(`\n=== FILES WITH WHITE RECTS (${results.withWhiteRects.length}) ===`);
results.withWhiteRects.forEach(f => console.log(f));

console.log(`\n=== DETAILED ANALYSIS OF WHITE RECT FILES ===`);
results.details.filter(d => d.hasWhiteRect).forEach(d => {
  console.log(`\n${d.file}:`);
  console.log(`  clipPathId: ${d.clipPathId}`);
  console.log(`  maskId: ${d.maskId}`);
  console.log(`  hasWhiteRectElement: ${d.hasWhiteRectElement}`);
  if (d.clipPathRect) {
    console.log(`  clipPathRect: ${d.clipPathRect}`);
  }
});
