/**
 * Shared legend layout + canvas rendering for the Editor overlay and PDF export.
 * Single source of truth for item collection, natural sizing, row layout, and icons.
 */

export const LEGEND_CONE_LABELS = {
  barrel: "Barrel",
  barrier: "Barrier",
  bollard: "Bollard",
  cone: "Cone",
  ped_tape: "Ped. Tape",
  type1: "Type 1",
  type2: "Type 2",
};

/** Deduped legend rows from map content + exclusions Set (sign codes / cone typeIds / "workArea"). */
export function collectLegendItems(
  placedSigns,
  conesFeatures,
  workAreas,
  legendExclusions
) {
  const ex = legendExclusions ?? new Set();
  const items = [];
  const dsc = new Set();
  const dct = new Set();

  for (const sg of placedSigns || []) {
    const code = sg.typeId ?? sg.code ?? sg.id;
    if (ex.has(code) || dsc.has(code)) continue;
    dsc.add(code);
    items.push({ kind: "sign", code });
  }
  for (const f of conesFeatures || []) {
    if (ex.has(f.typeId) || dct.has(f.typeId)) continue;
    dct.add(f.typeId);
    items.push({ kind: "cone", typeId: f.typeId });
  }
  if ((workAreas || []).length > 0 && !ex.has("workArea")) {
    items.push({ kind: "workArea" });
  }
  return items;
}

export function legendItemLabel(item) {
  if (item.kind === "sign") return String(item.code ?? "");
  if (item.kind === "cone") {
    return LEGEND_CONE_LABELS[item.typeId] || String(item.typeId ?? "");
  }
  return "Work Area";
}

/** Scale-aware cone icon drawing used only inside the legend thumbnail area (not map cones). */
export function drawConeLegendThumbnail(ctx, typeId, x, y, sz) {
  const cx = x + sz / 2,
    cy = y + sz / 2;
  ctx.save();
  if (typeId === "barrel") {
    ctx.fillStyle = "#F97316";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = Math.max(0.5, sz * 0.04);
    ctx.beginPath();
    ctx.arc(cx, cy, sz / 2 - 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (typeId === "bollard") {
    ctx.fillStyle = "#FCD34D";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = Math.max(0.5, sz * 0.04);
    ctx.beginPath();
    ctx.arc(cx, cy, sz / 2 - 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (typeId === "cone") {
    ctx.fillStyle = "#F59E0B";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = Math.max(0.5, sz * 0.04);
    ctx.beginPath();
    ctx.moveTo(cx, y + sz * (4 / 24));
    ctx.lineTo(x + sz * (20 / 24), y + sz * (20 / 24));
    ctx.lineTo(x + sz * (4 / 24), y + sz * (20 / 24));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (typeId === "barrier") {
    ctx.strokeStyle = "#9CA3AF";
    ctx.lineWidth = Math.max(1, sz * 0.07);
    ctx.setLineDash([sz * 0.17, sz * 0.12]);
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + sz, cy);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (typeId === "ped_tape") {
    ctx.strokeStyle = "#DC2626";
    ctx.lineWidth = Math.max(1, sz * 0.07);
    ctx.setLineDash([sz * 0.17, sz * 0.12]);
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + sz, cy);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (typeId === "type1") {
    const rx = x + sz * (7 / 32),
      ry = y + sz * (12 / 32),
      rw = sz * (18 / 32),
      rh = sz * (10 / 32);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = sz * 0.04;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = sz * (2.6 / 28);
    ctx.beginPath();
    ctx.moveTo(rx, ry + rh * 0.5);
    ctx.lineTo(rx + rw, ry);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx, ry + rh);
    ctx.lineTo(rx + rw, ry + rh * 0.3);
    ctx.stroke();
    ctx.strokeStyle = "#111";
    ctx.lineWidth = sz * (1.8 / 28);
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.3, ry + rh);
    ctx.lineTo(rx + rw * 0.2, y + sz * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.7, ry + rh);
    ctx.lineTo(rx + rw * 0.8, y + sz * 0.9);
    ctx.stroke();
  } else if (typeId === "type2") {
    const rx = x + sz * (6 / 32),
      ry = y + sz * (12 / 32),
      rw = sz * (20 / 32),
      rh = sz * (10 / 32);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = sz * 0.04;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = "#E5E7EB";
    ctx.fillRect(rx + sz * 0.06, ry - sz * 0.06, rw - sz * 0.12, sz * 0.09);
    ctx.strokeRect(rx + sz * 0.06, ry - sz * 0.06, rw - sz * 0.12, sz * 0.09);
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = sz * (2.6 / 28);
    ctx.beginPath();
    ctx.moveTo(rx, ry + rh * 0.5);
    ctx.lineTo(rx + rw, ry);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx, ry + rh);
    ctx.lineTo(rx + rw, ry + rh * 0.3);
    ctx.stroke();
    ctx.strokeStyle = "#111";
    ctx.lineWidth = sz * (1.8 / 28);
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.3, ry + rh);
    ctx.lineTo(rx + rw * 0.2, y + sz * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.7, ry + rh);
    ctx.lineTo(rx + rw * 0.8, y + sz * 0.9);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#F97316";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = Math.max(0.5, sz * 0.04);
    ctx.beginPath();
    ctx.arc(cx, cy, sz / 2 - 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Layout tokens scaled from legend width.
 * naturalW0 = tight legend width at scale 1 (text-measured); user width wPx scales all internals uniformly.
 */
export function legendLayoutScaled(wPx, naturalW0) {
  const safeNW = Math.max(44, Number(naturalW0) || 140);
  const s = wPx / safeNW;
  const pad = 8 * s;
  const iconSz = 22 * s;
  const iconGap = 6 * s;
  const rowH = Math.max(iconSz + 4 * s, 26 * s);
  const rowGap = 1 * s;
  const labelSz = 11 * s;
  const titleSz = 13 * s;
  const divThick = Math.max(1, 1 * s);
  const afterDiv = 3 * s;
  const titleBlock =
    titleSz * 1.5 + 4 * s + divThick + afterDiv;
  const lw = Math.max(1, 1.5 * s);
  return {
    s,
    naturalW0: safeNW,
    pad,
    iconSz,
    iconGap,
    rowH,
    rowGap,
    labelSz,
    titleSz,
    divThick,
    afterDiv,
    titleBlock,
    lw,
  };
}

/** Legend pixel height for Editor sizing / preview — matches buildLegendCanvas. */
export function legendCanvasPixelHeight(allItems, wPx, naturalW0) {
  const { pad, rowH, rowGap, titleBlock, lw } = legendLayoutScaled(
    wPx,
    naturalW0
  );
  const n = (allItems || []).length;
  const contentH =
    n > 0 ? n * rowH + Math.max(0, n - 1) * rowGap : rowH;
  const innerBody = pad + titleBlock + contentH + pad;
  return Math.ceil(innerBody + lw);
}

/**
 * Minimum legend width at scale 1 from typography + longest row label + title row.
 */
export function measureLegendNaturalBase(allItems) {
  const pad = 8;
  const iconSz = 22;
  const iconGap = 6;
  const rowGap = 1;
  const titleSz = 13;
  const divThick = 1;
  const afterDiv = 3;
  const lw = 1.5;
  const rowH = Math.max(iconSz + 4, 26);

  const cv =
    typeof document !== "undefined"
      ? document.createElement("canvas")
      : null;
  const ctx = cv?.getContext?.("2d");

  let maxLabelW = 0;
  let titleW = 52;
  if (ctx) {
    ctx.font = "11px Arial, Helvetica, sans-serif";
    for (const item of allItems || []) {
      const label = legendItemLabel(item);
      maxLabelW = Math.max(maxLabelW, ctx.measureText(label).width);
    }
    ctx.font = `bold ${titleSz}px Arial, Helvetica, sans-serif`;
    titleW = ctx.measureText("Legend").width;
  }

  const rowInnerW = pad + iconSz + iconGap + maxLabelW + pad;
  const innerW = Math.max(rowInnerW, titleW + pad * 2);
  const naturalW0 = Math.max(72, Math.ceil(lw + innerW + lw));

  const n = (allItems || []).length;
  const contentH =
    n > 0 ? n * rowH + Math.max(0, n - 1) * rowGap : rowH;
  const titleBlock = titleSz * 1.5 + 4 + divThick + afterDiv;
  const innerBody = pad + titleBlock + contentH + pad;
  const naturalH0 = Math.ceil(innerBody + lw);

  return { naturalW0, naturalH0 };
}

function truncateLegendLabel(ctx, text, maxW) {
  const t = String(text ?? "");
  if (!maxW || maxW <= 8 || ctx.measureText(t).width <= maxW) return t;
  const ell = "…";
  let lo = 0,
    hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const probe = t.slice(0, mid) + ell;
    if (ctx.measureText(probe).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return lo <= 0 ? ell : t.slice(0, lo) + ell;
}

/** Fallback miniature sign plate when raster isn't loaded yet (not a checkbox). */
function drawSignLegendFallback(ctx, code, iconX, iconY, iconSz) {
  const lwBox = Math.max(0.5, iconSz * 0.06);
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = lwBox;
  ctx.fillRect(iconX, iconY, iconSz, iconSz);
  ctx.strokeRect(iconX + lwBox / 2, iconY + lwBox / 2, iconSz - lwBox, iconSz - lwBox);
  ctx.fillStyle = "#111111";
  const fz = Math.max(5.5, Math.min(iconSz * 0.26, 11));
  ctx.font = `bold ${fz}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = iconX + iconSz / 2,
    cy = iconY + iconSz / 2;
  const maxW = iconSz - lwBox * 4;
  const txt = truncateLegendLabel(ctx, String(code ?? ""), maxW);
  ctx.fillText(txt, cx, cy, maxW);
  ctx.restore();
}

/**
 * Render legend to an offscreen canvas (Editor + PDF use the same bitmap so output matches).
 */
export async function buildLegendCanvas(allItems, wPx, naturalW0, signDataUrls) {
  const DPR = 2;
  const layout = legendLayoutScaled(wPx, naturalW0);
  const {
    pad,
    iconSz,
    iconGap,
    rowH,
    rowGap,
    labelSz,
    titleSz,
    divThick,
    afterDiv,
    titleBlock,
    lw,
  } = layout;
  const canvasH = legendCanvasPixelHeight(allItems, wPx, naturalW0);

  const cv =
    typeof document !== "undefined"
      ? document.createElement("canvas")
      : null;
  if (!cv) throw new Error("buildLegendCanvas requires a browser document");
  cv.width = Math.round(wPx * DPR);
  cv.height = Math.round(canvasH * DPR);
  const ctx = cv.getContext("2d");
  ctx.scale(DPR, DPR);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, wPx, canvasH);
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = lw;
  ctx.strokeRect(lw / 2, lw / 2, wPx - lw, canvasH - lw);

  ctx.fillStyle = "#111111";
  ctx.font = `bold ${Math.round(titleSz)}px Arial, Helvetica, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText("Legend", pad, pad);

  const divY = pad + titleSz * 1.5 + 4 * layout.s;
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = divThick;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(pad, divY);
  ctx.lineTo(wPx - pad, divY);
  ctx.stroke();

  const signImages = {};
  await Promise.allSettled(
    Object.entries(signDataUrls || {}).map(
      ([code, dataUrl]) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            signImages[code] = img;
            resolve();
          };
          img.onerror = resolve;
          img.src = dataUrl;
        })
    )
  );

  let rowY = divY + divThick + afterDiv;

  for (const item of allItems || []) {
    const iconX = pad;
    const iconY = rowY + (rowH - iconSz) / 2;
    const textX = iconX + iconSz + iconGap;
    const textY = rowY + rowH / 2;
    const maxTextW = wPx - textX - pad;

    ctx.setLineDash([]);
    if (item.kind === "sign") {
      const img = signImages[item.code];
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, iconX, iconY, iconSz, iconSz);
      } else {
        drawSignLegendFallback(ctx, item.code, iconX, iconY, iconSz);
      }
    } else if (item.kind === "cone") {
      drawConeLegendThumbnail(ctx, item.typeId, iconX, iconY, iconSz);
    } else {
      ctx.fillStyle = "rgba(0,200,83,0.18)";
      ctx.fillRect(iconX, iconY, iconSz, iconSz);
      ctx.strokeStyle = "#00c853";
      ctx.lineWidth = Math.max(1, 1.5 * layout.s);
      ctx.strokeRect(iconX, iconY, iconSz, iconSz);
      ctx.strokeStyle = "#00c853";
      ctx.lineWidth = Math.max(0.5, 0.8 * layout.s);
      ctx.beginPath();
      ctx.moveTo(iconX, iconY);
      ctx.lineTo(iconX + iconSz, iconY + iconSz);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(iconX + iconSz, iconY);
      ctx.lineTo(iconX, iconY + iconSz);
      ctx.stroke();
    }

    const label = legendItemLabel(item);
    ctx.setLineDash([]);
    ctx.fillStyle = "#111111";
    ctx.font = `${Math.round(labelSz)}px Arial, Helvetica, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const disp = truncateLegendLabel(ctx, label, maxTextW);
    ctx.fillText(disp, textX, textY);

    rowY += rowH + rowGap;
  }

  if ((allItems || []).length === 0) {
    ctx.fillStyle = "#999999";
    ctx.font = `italic ${Math.round(11 * layout.s)}px Arial, Helvetica, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("No items", pad, divY + divThick + afterDiv + rowH / 2);
  }

  return cv;
}
