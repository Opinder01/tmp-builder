import { jsPDF } from "jspdf";

// The finished PDF must stay under 20 MB (easy to email / upload). Phone
// photos are 2-5 MB each, so they are downscaled and recompressed; the budget
// leaves headroom for the table pages and PDF structure.
const PHOTO_BUDGET_BYTES = 18 * 1024 * 1024;

// Tried in order until the photos fit the budget. The first step is already
// plenty sharp for a letter-size page (~2000px across the long edge).
const PHOTO_QUALITY_STEPS = [
  { maxSide: 2000, quality: 0.8 },
  { maxSide: 1600, quality: 0.7 },
  { maxSide: 1300, quality: 0.6 },
  { maxSide: 1000, quality: 0.5 },
  { maxSide: 800, quality: 0.4 },
];

// Draws `img` onto an off-screen canvas rotated by `degrees` (0/90/180/270,
// clockwise), scaled so its long edge is at most `maxSide`, and returns a flat
// JPEG data URL, its byte size, and the rotated dimensions of the original
// (used for page layout) -- simpler and more predictable than relying on
// jsPDF's own image-rotation positioning, which rotates around a corner in a
// way that's easy to get wrong.
function renderJpeg(img, degrees, { maxSide, quality }) {
  const swap = degrees === 90 || degrees === 270;
  const fullW = swap ? img.height : img.width;
  const fullH = swap ? img.width : img.height;
  const scale = Math.min(1, maxSide / Math.max(fullW, fullH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(fullW * scale);
  canvas.height = Math.round(fullH * scale);
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, (-img.width * scale) / 2, (-img.height * scale) / 2, img.width * scale, img.height * scale);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const bytes = Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
  return { dataUrl, bytes, fullWidth: fullW, fullHeight: fullH };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

// Loads every slip photo (rotated as chosen) and shrinks them step by step
// until their combined size fits PHOTO_BUDGET_BYTES. Later passes re-encode the
// already-downscaled JPEGs so only one full-size photo is decoded at a time.
// Returns Map(dispatch id -> rendered photo); photos that fail to load are
// simply absent.
async function prepareSlipPhotos(dispatches, rotations) {
  const photos = new Map();
  for (const d of dispatches) {
    try {
      const img = await loadImage(d.timesheets.slip_photo_url);
      photos.set(d.id, renderJpeg(img, rotations[d.id] || 0, PHOTO_QUALITY_STEPS[0]));
    } catch {
      // Left out; the photo page shows a "could not load" note instead.
    }
  }

  const totalBytes = () => [...photos.values()].reduce((sum, p) => sum + p.bytes, 0);
  for (let step = 1; step < PHOTO_QUALITY_STEPS.length && totalBytes() > PHOTO_BUDGET_BYTES; step++) {
    for (const [id, photo] of photos) {
      const img = await loadImage(photo.dataUrl);
      const smaller = renderJpeg(img, 0, PHOTO_QUALITY_STEPS[step]);
      photos.set(id, { ...smaller, fullWidth: photo.fullWidth, fullHeight: photo.fullHeight });
    }
  }
  return photos;
}

// Summary table followed by one page per shift's timesheet slip photo, each
// rotated per `rotations` (dispatch id -> degrees clockwise) if provided.
// `showWorkerColumn` adds a Worker column/label -- needed for a contractor's
// schedule, which can span multiple different workers (a worker's own
// schedule doesn't need it, since every row is already that one person).
async function generateShiftsPdf({ title, subtitle, dispatches, rotations = {}, showWorkerColumn = false }) {
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 15;
  let y = 20;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Crown Traffic Management", marginX, y);
  y += 8;

  pdf.setFontSize(12);
  pdf.text(title, marginX, y);
  y += 6;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text(subtitle || `Generated ${new Date().toLocaleDateString()}`, marginX, y);
  y += 10;

  const columns = showWorkerColumn
    ? [
        { label: "Job #", width: 18 },
        { label: "Flagger", width: 28 },
        { label: "Title", width: 16 },
        { label: "Date", width: 22 },
        { label: "Location", width: 38 },
        { label: "Hours", width: 16 },
        { label: "Status", width: 22 },
      ]
    : [
        { label: "Job #", width: 22 },
        { label: "Title", width: 16 },
        { label: "Date", width: 26 },
        { label: "Location", width: 46 },
        { label: "Hours", width: 18 },
        { label: "Status", width: 26 },
      ];

  function drawHeaderRow() {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(15, 23, 42);
    let x = marginX;
    for (const col of columns) {
      pdf.text(col.label, x, y);
      x += col.width;
    }
    y += 2;
    pdf.setDrawColor(203, 213, 225);
    pdf.line(marginX, y, pageW - marginX, y);
    y += 5;
  }

  drawHeaderRow();
  pdf.setFont("helvetica", "normal");

  let totalHours = 0;

  for (const d of dispatches) {
    if (y > 270) {
      pdf.addPage();
      y = 20;
      drawHeaderRow();
      pdf.setFont("helvetica", "normal");
    }

    const ts = d.timesheets; // 1:1 relationship, embedded as a single object or null
    const hours = ts?.status === "approved" ? ts.calculated_hours : null;
    if (hours) totalHours += hours;

    const row = showWorkerColumn
      ? [
          d.job_number,
          d.worker?.full_name || "-",
          d.title || "-",
          new Date(d.start_time).toLocaleDateString(),
          d.location,
          hours != null ? String(hours) : "-",
          ts ? ts.status : "no timesheet",
        ]
      : [
          d.job_number,
          d.title || "-",
          new Date(d.start_time).toLocaleDateString(),
          d.location,
          hours != null ? String(hours) : "-",
          ts ? ts.status : "no timesheet",
        ];

    let x = marginX;
    pdf.setTextColor(30, 41, 59);
    for (let i = 0; i < columns.length; i++) {
      const text = pdf.splitTextToSize(row[i], columns[i].width - 2);
      pdf.text(text, x, y);
      x += columns[i].width;
    }
    y += 6;
  }

  y += 4;
  pdf.setDrawColor(203, 213, 225);
  pdf.line(marginX, y, pageW - marginX, y);
  y += 7;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.text(`Total approved hours: ${totalHours}`, marginX, y);

  // One page per timesheet slip photo, rotated as chosen in the preview step.
  const withPhotos = dispatches.filter((d) => d.timesheets?.slip_photo_url);
  const photos = await prepareSlipPhotos(withPhotos, rotations);
  for (const d of withPhotos) {
    pdf.addPage();
    let py = 18;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    const label = showWorkerColumn
      ? `Job ${d.job_number || "-"} — ${d.worker?.full_name || "-"} — ${d.location} — ${new Date(d.start_time).toLocaleDateString()}`
      : `Job ${d.job_number || "-"} — ${d.location} — ${new Date(d.start_time).toLocaleDateString()}`;
    pdf.text(label, marginX, py);
    py += 8;

    try {
      const photo = photos.get(d.id);
      if (!photo) throw new Error("Photo unavailable");

      const maxW = pageW - marginX * 2;
      const maxH = pageH - py - 15;
      // jsPDF addImage expects width/height in the document's unit (mm);
      // treat the original pixels as 96dpi and scale down further to fit
      // (the embedded JPEG may have fewer pixels than the original).
      const pxToMm = 25.4 / 96;
      let drawW = photo.fullWidth * pxToMm;
      let drawH = photo.fullHeight * pxToMm;
      const fit = Math.min(maxW / drawW, maxH / drawH, 1);
      drawW *= fit;
      drawH *= fit;

      pdf.addImage(photo.dataUrl, "JPEG", marginX, py, drawW, drawH);
    } catch (err) {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.text("(Could not load timesheet photo)", marginX, py);
    }
  }

  return pdf;
}

export async function generateWorkerSummaryPdf(worker, dispatches, rotations = {}) {
  const pdf = await generateShiftsPdf({
    title: `${worker.full_name} (${worker.worker_type})`,
    dispatches,
    rotations,
    showWorkerColumn: false,
  });
  const dateStamp = new Date().toISOString().slice(0, 10);
  const safeName = worker.full_name.replace(/[^a-zA-Z0-9]+/g, "-");
  pdf.save(`${safeName}-${dateStamp}.pdf`);
}

export async function generateContractorSummaryPdf(company, dispatches, rotations = {}) {
  const pdf = await generateShiftsPdf({
    title: company.name,
    subtitle: `Contractor — Generated ${new Date().toLocaleDateString()}`,
    dispatches,
    rotations,
    showWorkerColumn: true,
  });
  const dateStamp = new Date().toISOString().slice(0, 10);
  const safeName = company.name.replace(/[^a-zA-Z0-9]+/g, "-");
  pdf.save(`${safeName}-${dateStamp}.pdf`);
}
