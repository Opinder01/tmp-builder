/**
 * High-resolution Google Static Maps stitching for PDF export.
 * Not the previous aerial helper — fresh pipeline with a larger tile budget + bounded concurrency.
 */

export const STATIC_MAP_CSS_MAX = 640;
/** Static Maps `scale` parameter (2 = “retina”; doubles pixel dimensions server-side). */
export const STATIC_MAP_SCALE = 2;
/** Vertical padding (CSS px) so center-crop clears Google’s per-tile attribution strip. */
export const STATIC_MAP_ATTRIB_PAD_CSS = 44;

/** Tile grid cap while exporting to PDF (higher → sharper map / labels at same geographic zoom). */
export const EXPORT_PDF_TILE_GRID = { maxCols: 12, maxRows: 12 };

export function normalizeExportLatLngBounds(rawBounds) {
  if (!rawBounds?.nw || !rawBounds?.se) return null;
  const nwLat = Math.max(rawBounds.nw.lat, rawBounds.se.lat);
  const seLat = Math.min(rawBounds.nw.lat, rawBounds.se.lat);
  const nwLng = Math.min(rawBounds.nw.lng, rawBounds.se.lng);
  const seLng = Math.max(rawBounds.nw.lng, rawBounds.se.lng);
  return { nw: { lat: nwLat, lng: nwLng }, se: { lat: seLat, lng: seLng } };
}

function mercatorWorldSize(zoomInt) {
  return 256 * Math.pow(2, zoomInt);
}

/** Used by the editor overlay projector so geometry matches the stitched raster. */
export function latLngToWorldPx(lat, lng, zoomInt) {
  const s = mercatorWorldSize(zoomInt);
  const x = ((lng + 180) / 360) * s;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s;
  return { x, y };
}

function worldYToLat(worldY, zoomInt) {
  const s = mercatorWorldSize(zoomInt);
  const t = worldY / s;
  const k = Math.exp((0.5 - t) * 4 * Math.PI);
  const sin = (k - 1) / (k + 1);
  return (Math.asin(Math.max(-1, Math.min(1, sin))) * 180) / Math.PI;
}

/**
 * Choose integer zoom + tile subdivisions so the export region fits in maxCols × maxRows Static Map requests.
 */
export function computeExportTileSpec(normalizedBounds, fractionalZoom, grid = EXPORT_PDF_TILE_GRID) {
  const maxCols = grid?.maxCols ?? EXPORT_PDF_TILE_GRID.maxCols;
  const maxRows = grid?.maxRows ?? EXPORT_PDF_TILE_GRID.maxRows;

  const nwLat = normalizedBounds.nw.lat;
  const nwLng = normalizedBounds.nw.lng;
  const seLat = normalizedBounds.se.lat;
  const seLng = normalizedBounds.se.lng;

  const TILE_CONTENT_MAX_H = STATIC_MAP_CSS_MAX - STATIC_MAP_ATTRIB_PAD_CSS;
  const editorRoundedZoom = Math.min(21, Math.round(fractionalZoom ?? 18));

  let zoom = editorRoundedZoom;
  let nwWorld;
  let seWorld;
  let boundsPxW = 0;
  let boundsPxH = 0;

  for (let z = editorRoundedZoom; z >= 1; z--) {
    const nw = latLngToWorldPx(nwLat, nwLng, z);
    const se = latLngToWorldPx(seLat, seLng, z);
    const w = Math.abs(se.x - nw.x);
    const h = Math.abs(se.y - nw.y);
    zoom = z;
    nwWorld = nw;
    seWorld = se;
    boundsPxW = w;
    boundsPxH = h;
    if (
      Math.ceil(w / STATIC_MAP_CSS_MAX) <= maxCols &&
      Math.ceil(h / TILE_CONTENT_MAX_H) <= maxRows
    ) {
      break;
    }
  }

  const numCols = Math.min(maxCols, Math.max(1, Math.ceil(boundsPxW / STATIC_MAP_CSS_MAX)));
  const numRows = Math.min(maxRows, Math.max(1, Math.ceil(boundsPxH / TILE_CONTENT_MAX_H)));
  const tileWorldW = boundsPxW / numCols;
  const tileWorldH = boundsPxH / numRows;
  const tileReqW = Math.min(STATIC_MAP_CSS_MAX, Math.ceil(tileWorldW) + 4);
  const tileReqH = Math.min(STATIC_MAP_CSS_MAX, Math.ceil(tileWorldH) + STATIC_MAP_ATTRIB_PAD_CSS);

  return {
    zoom,
    nwWorld,
    seWorld,
    boundsPxW,
    boundsPxH,
    numCols,
    numRows,
    tileWorldW,
    tileWorldH,
    tileReqW,
    tileReqH,
    mapFracZoomAtOpen: fractionalZoom,
    editorRoundedZoom,
  };
}

async function loadTileImage(url, fetchStaticMapAsDataUrlFn) {
  const dataUrl = await fetchStaticMapAsDataUrlFn(url);
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode Static Map tile"));
    img.src = dataUrl;
  });
}

/**
 * Fetch tiles with bounded parallelism (many tiles × Static Maps quota).
 */
async function runPool(limit, tasks) {
  const results = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  }

  const n = Math.max(1, Math.min(limit, tasks.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * Stitch Static Maps PNGs into one canvas (device pixels = CSS px × STATIC_MAP_SCALE).
 */
export async function stitchExportMapTiles(spec, maptype, apiKey, fetchStaticMapAsDataUrlFn, options = {}) {
  const concurrency = options.tileConcurrency ?? 8;
  const GOOGLE_SCALE = STATIC_MAP_SCALE;
  const { tileReqW, tileReqH, tileWorldW, tileWorldH, numCols, numRows, boundsPxW, boundsPxH } = spec;

  const imgW = Math.max(1, Math.round(boundsPxW));
  const imgH = Math.max(1, Math.round(boundsPxH));
  const outW = Math.max(1, Math.round(imgW * GOOGLE_SCALE));
  const outH = Math.max(1, Math.round(imgH * GOOGLE_SCALE));

  const zoom = spec.zoom;
  const WS = mercatorWorldSize(zoom);
  const { nwWorld } = spec;

  const jobs = [];
  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const cx = nwWorld.x + (col + 0.5) * tileWorldW;
      const cy = nwWorld.y + (row + 0.5) * tileWorldH;
      const lat = worldYToLat(cy, zoom);
      const lng = (cx / WS) * 360 - 180;
      const url =
        "https://maps.googleapis.com/maps/api/staticmap" +
        `?maptype=${maptype}&format=png&scale=${GOOGLE_SCALE}` +
        `&size=${tileReqW}x${tileReqH}` +
        `&center=${lat.toFixed(7)},${lng.toFixed(7)}` +
        `&zoom=${zoom}&key=${encodeURIComponent(apiKey)}`;

      jobs.push({
        row,
        col,
        url,
      });
    }
  }

  const images = await runPool(
    concurrency,
    jobs.map(({ url }) => () => loadTileImage(url, fetchStaticMapAsDataUrlFn))
  );

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (let i = 0; i < jobs.length; i++) {
    const { row, col } = jobs[i];
    const img = images[i];
    const srcX = Math.round(((tileReqW - tileWorldW) / 2) * GOOGLE_SCALE);
    const srcY = Math.round(((tileReqH - tileWorldH) / 2) * GOOGLE_SCALE);
    const srcW = Math.round(tileWorldW * GOOGLE_SCALE);
    const srcH = Math.round(tileWorldH * GOOGLE_SCALE);
    const dstX = Math.round(col * tileWorldW * GOOGLE_SCALE);
    const dstY = Math.round(row * tileWorldH * GOOGLE_SCALE);
    ctx.drawImage(img, srcX, srcY, srcW, srcH, dstX, dstY, srcW, srcH);
  }

  return {
    canvas,
    imgW,
    imgH,
    zoom: spec.zoom,
    nwWorld: spec.nwWorld,
    seWorld: spec.seWorld,
    boundsPxW,
    boundsPxH,
  };
}
