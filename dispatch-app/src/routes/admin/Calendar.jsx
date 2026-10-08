import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// One calendar entry per job: a "New Dispatch" sent to several flaggers is
// several dispatch rows sharing a group_id, shown here as a single shift.
function buildItems(dispatches, bookings) {
  const shifts = new Map();
  for (const d of dispatches) {
    const key = d.group_id || d.id;
    if (!shifts.has(key)) {
      shifts.set(key, {
        kind: "shift",
        id: key,
        start_time: d.start_time,
        location: d.location,
        job_number: d.job_number,
        contractor: d.client_company_name,
        editId: d.id,
        flaggers: [],
      });
    }
    shifts.get(key).flaggers.push({ name: d.worker?.full_name || "?", title: d.title });
  }
  const items = [...shifts.values()];
  for (const b of bookings) {
    if (b.status !== "booked") continue;
    items.push({
      kind: "booking",
      id: b.id,
      start_time: b.start_time,
      location: b.location,
      contractor: b.client_company_name,
      flaggers_needed: b.flaggers_needed,
      source: b.source,
      notes: b.notes,
    });
  }
  return items.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
}

function itemLabel(item) {
  return item.contractor || item.location;
}

export default function Calendar() {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(dateKey(today));
  const [dispatches, setDispatches] = useState(null);
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/dispatches?action=list").then((d) => setDispatches(d.dispatches)).catch((e) => setError(e.message));
    api.get("/api/bookings?action=list").then((d) => setBookings(d.bookings)).catch((e) => setError(e.message));
  }, []);

  const byDay = useMemo(() => {
    const map = new Map();
    if (!dispatches || !bookings) return map;
    for (const item of buildItems(dispatches, bookings)) {
      const key = dateKey(new Date(item.start_time));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return map;
  }, [dispatches, bookings]);

  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(1 - firstOfMonth.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
  const weeks = cells.slice(35).every((d) => d.getMonth() !== month.getMonth()) ? 5 : 6;
  const visibleCells = cells.slice(0, weeks * 7);

  const todayKey = dateKey(today);
  const selectedItems = byDay.get(selected) || [];
  const loading = (!dispatches || !bookings) && !error;

  function shiftMonth(delta) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  function goToday() {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelected(todayKey);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Calendar</h1>
        <div>
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>{" "}
          <button onClick={goToday}>Today</button>{" "}
          <button onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
        </div>
      </div>

      <h2 className="section-heading">
        {month.toLocaleDateString([], { month: "long", year: "numeric" })}
      </h2>
      <p className="subtle">
        <span className="cal-legend cal-shift" /> Dispatched shifts
        {"  "}
        <span className="cal-legend cal-booking" /> Bookings still to dispatch
      </p>

      {error && <p className="error">{error}</p>}
      {loading && <p>Loading...</p>}

      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">{w}</div>
        ))}
        {visibleCells.map((d) => {
          const key = dateKey(d);
          const items = byDay.get(key) || [];
          const classes = [
            "cal-cell",
            d.getMonth() !== month.getMonth() ? "cal-outside" : "",
            key === todayKey ? "cal-today" : "",
            key === selected ? "cal-selected" : "",
            key < todayKey ? "cal-past" : "",
          ].join(" ");
          return (
            <div key={key} className={classes} onClick={() => setSelected(key)}>
              <div className="cal-daynum">{d.getDate()}</div>
              {items.slice(0, 3).map((item) => (
                <div key={item.id} className={`cal-chip cal-${item.kind}`}>
                  {timeLabel(item.start_time)} {itemLabel(item)}
                </div>
              ))}
              {items.length > 3 && <div className="cal-more">+{items.length - 3} more</div>}
              {items.length > 0 && (
                <div className="cal-dots">
                  {items.slice(0, 4).map((item) => (
                    <span key={item.id} className={`cal-dot cal-${item.kind}`} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="section-heading">
        {new Date(`${selected}T00:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
      </h2>
      {selectedItems.length === 0 && !loading && <p className="subtle">Nothing scheduled this day.</p>}
      {selectedItems.map((item) =>
        item.kind === "shift" ? (
          <div key={item.id} className="dispatch-card cal-detail-shift">
            <p>
              <strong>{timeLabel(item.start_time)}</strong> — {item.job_number ? `Job ${item.job_number} — ` : ""}
              {item.location}
            </p>
            {item.contractor && <p className="subtle">Contractor: {item.contractor}</p>}
            <p>
              Flaggers:{" "}
              {item.flaggers.map((f) => (f.title ? `${f.name} (${f.title})` : f.name)).join(", ")}
            </p>
            <Link to={`/dispatch/${item.editId}/edit`}>Edit</Link>
          </div>
        ) : (
          <div key={item.id} className="dispatch-card cal-detail-booking">
            <p>
              <strong>{timeLabel(item.start_time)}</strong> — {item.location}
              <span className="status status-warn"> Not dispatched yet</span>
            </p>
            {item.contractor && <p className="subtle">Contractor: {item.contractor}</p>}
            <p className="subtle">
              Booked via {item.source}
              {item.flaggers_needed ? ` — ${item.flaggers_needed} flagger(s) needed` : ""}
            </p>
            {item.notes && <p className="subtle">Notes: {item.notes}</p>}
            <Link to={`/dispatch/new?booking=${item.id}`}>Dispatch this</Link>
            {" | "}
            <Link to="/bookings">Bookings</Link>
          </div>
        )
      )}
    </div>
  );
}
