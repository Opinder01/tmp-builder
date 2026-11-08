import { useState } from "react";

// A date + a time, picked separately, reported to the parent as a single
// "YYYY-MM-DDTHH:mm" value (BC wall-clock time, the same shape
// <input type="datetime-local"> gives, so it plugs straight into
// fromInputValue()). The parent hears "" until BOTH parts are filled in and
// the year is sensible, so a half-typed value (a year like "0002", an empty
// time...) can never reach the save call and blow up.
//
// Uncontrolled on purpose: pass the starting value as `defaultValue` and
// change the component's `key` to reset it (e.g. when switching bookings).
const MIN_YEAR = 2020;
const MAX_YEAR = 2100;

function yearOf(date) {
  return Number(String(date).split("-")[0]);
}

export default function DateTimeField({ defaultValue = "", onChange, required }) {
  const [initialDate = "", initialTime = ""] = defaultValue.split("T");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime.slice(0, 5));

  const yearOk = !date || (yearOf(date) >= MIN_YEAR && yearOf(date) <= MAX_YEAR);

  function emit(nextDate, nextTime) {
    const ready = nextDate && nextTime && yearOf(nextDate) >= MIN_YEAR && yearOf(nextDate) <= MAX_YEAR;
    onChange(ready ? `${nextDate}T${nextTime}` : "");
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="date"
          required={required}
          aria-label="Date"
          min={`${MIN_YEAR}-01-01`}
          max={`${MAX_YEAR}-12-31`}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            emit(e.target.value, time);
          }}
        />
        <input
          type="time"
          required={required}
          aria-label="Start time"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            emit(date, e.target.value);
          }}
        />
      </div>
      {!yearOk && <span className="error">Check the year — it should be between {MIN_YEAR} and {MAX_YEAR}.</span>}
    </div>
  );
}
