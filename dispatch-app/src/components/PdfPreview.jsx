import { useEffect, useMemo, useState } from "react";
import { formatDate } from "../lib/tz.js";

// Earliest shift first by default, so a month's PDF reads Oct 1 -> Oct 31.
// Dragging or the arrow buttons override that with a custom sequence; the
// custom sequence is cleared whenever `resetKey` changes (e.g. the date range)
// so a new range always starts chronological again.
export function useShiftSequence(dispatches, resetKey) {
  const [customOrder, setCustomOrder] = useState(null);

  useEffect(() => {
    setCustomOrder(null);
  }, [resetKey]);

  const chronological = useMemo(
    () => [...dispatches].sort((a, b) => new Date(a.start_time) - new Date(b.start_time)),
    [dispatches]
  );

  const ordered = useMemo(() => {
    if (!customOrder) return chronological;
    const position = new Map(customOrder.map((id, i) => [id, i]));
    return [...chronological].sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity));
  }, [chronological, customOrder]);

  function moveTo(id, targetId) {
    if (id === targetId) return;
    const ids = ordered.map((d) => d.id);
    const from = ids.indexOf(id);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setCustomOrder(ids);
  }

  return { ordered, isCustom: customOrder !== null, moveTo, reset: () => setCustomOrder(null) };
}

export default function PdfPreview({
  photos,
  totalShifts,
  rotations,
  onRotate,
  onMoveTo,
  onReset,
  isCustom,
  onDownload,
  generating,
  showFlagger,
}) {
  const [dragId, setDragId] = useState(null);

  function moveBy(index, delta) {
    const neighbor = photos[index + delta];
    if (neighbor) onMoveTo(photos[index].id, neighbor.id);
  }

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "1rem", margin: "1rem 0" }}>
      <h2 style={{ marginTop: 0 }}>PDF Preview</h2>
      <p className="subtle">
        {totalShifts} shift(s) in range, {photos.length} with a timesheet photo. Shown earliest
        first — the PDF's table and photo pages follow this exact order. Drag a photo (or use the
        arrows) to change the sequence, and Rotate any that's sideways.
      </p>
      {isCustom && (
        <p>
          <button type="button" onClick={onReset}>Reset to earliest first</button>
        </p>
      )}

      {photos.length === 0 && <p>No timesheet photos in this range.</p>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        {photos.map((d, i) => {
          const degrees = rotations[d.id] || 0;
          return (
            <div
              key={d.id}
              draggable
              onDragStart={() => setDragId(d.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) onMoveTo(dragId, d.id);
                setDragId(null);
              }}
              style={{
                width: 160,
                textAlign: "center",
                cursor: "grab",
                opacity: dragId === d.id ? 0.4 : 1,
              }}
            >
              <div style={{ position: "relative", height: 160, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    left: 4,
                    zIndex: 1,
                    background: "#0f172a",
                    color: "white",
                    borderRadius: 10,
                    padding: "0 7px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  {i + 1}
                </span>
                <img
                  src={d.timesheets.slip_photo_url}
                  alt="Timesheet slip"
                  draggable={false}
                  style={{
                    maxWidth: degrees % 180 === 0 ? "100%" : "160px",
                    maxHeight: degrees % 180 === 0 ? "160px" : "100%",
                    transform: `rotate(${degrees}deg)`,
                  }}
                />
              </div>
              <p className="subtle" style={{ margin: "0.4rem 0" }}>
                {formatDate(d.start_time)}
                <br />
                {d.job_number ? `Job ${d.job_number}` : d.location}
                {showFlagger && (
                  <>
                    <br />
                    {d.worker?.full_name}
                  </>
                )}
              </p>
              <div style={{ display: "flex", gap: "0.25rem", justifyContent: "center" }}>
                <button type="button" disabled={i === 0} onClick={() => moveBy(i, -1)} aria-label="Move earlier">
                  ◀
                </button>
                <button type="button" onClick={() => onRotate(d.id)}>Rotate</button>
                <button type="button" disabled={i === photos.length - 1} onClick={() => moveBy(i, 1)} aria-label="Move later">
                  ▶
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={onDownload} disabled={generating} style={{ marginTop: "1rem" }}>
        {generating ? "Generating..." : "Download PDF"}
      </button>
    </div>
  );
}
