import { jsPDF } from "jspdf";

// Simple tabular shift/hours summary for one worker, mirroring the jsPDF
// usage already established in client/src/Editor.jsx (mm units, helvetica).
export function generateWorkerSummaryPdf(worker, dispatches) {
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const marginX = 15;
  let y = 20;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Crown Traffic Management", marginX, y);
  y += 8;

  pdf.setFontSize(12);
  pdf.text(`${worker.full_name} (${worker.worker_type})`, marginX, y);
  y += 6;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Generated ${new Date().toLocaleDateString()}`, marginX, y);
  y += 10;

  const columns = [
    { label: "Job #", width: 25 },
    { label: "Date", width: 28 },
    { label: "Location", width: 55 },
    { label: "Hours", width: 20 },
    { label: "Status", width: 30 },
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

    const row = [
      d.job_number,
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

  const dateStamp = new Date().toISOString().slice(0, 10);
  const safeName = worker.full_name.replace(/[^a-zA-Z0-9]+/g, "-");
  pdf.save(`${safeName}-${dateStamp}.pdf`);
}
