import { jsPDF } from "jspdf";

// Draws `img` onto an off-screen canvas rotated by `degrees` (0/90/180/270,
// clockwise) and returns a flat JPEG data URL plus its resulting dimensions
// -- simpler and more predictable than relying on jsPDF's own image-rotation
// positioning, which rotates around a corner in a way that's easy to get wrong.
function rotateImage(img, degrees) {
  const swap = degrees === 90 || degrees === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? img.height : img.width;
  canvas.height = swap ? img.width : img.height;
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), width: canvas.width, height: canvas.height };
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
        { label: "Worker", width: 28 },
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
      const img = await loadImage(d.timesheets.slip_photo_url);
      const degrees = rotations[d.id] || 0;
      const rotated = rotateImage(img, degrees);

      const maxW = pageW - marginX * 2;
      const maxH = pageH - py - 15;
      // jsPDF addImage expects width/height in the document's unit (mm);
      // treat the source pixels as 96dpi and scale down further to fit.
      const pxToMm = 25.4 / 96;
      let drawW = rotated.width * pxToMm;
      let drawH = rotated.height * pxToMm;
      const fit = Math.min(maxW / drawW, maxH / drawH, 1);
      drawW *= fit;
      drawH *= fit;

      pdf.addImage(rotated.dataUrl, "JPEG", marginX, py, drawW, drawH);
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
