// Server counterpart of src/lib/tz.js. Vercel runs in UTC, but Crown Traffic's
// pay periods, invoices and "days" are British Columbia calendar days.
export const APP_TIME_ZONE = "America/Vancouver";

const wallClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function wallParts(ms) {
  const parts = {};
  for (const { type, value } of wallClock.formatToParts(new Date(ms))) parts[type] = value;
  return parts;
}

function offsetAt(ms) {
  const p = wallParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// "YYYY-MM-DD" of the BC calendar day an instant falls on.
export function dateKey(value) {
  const p = wallParts(new Date(value).getTime());
  return `${p.year}-${p.month}-${p.day}`;
}

// ISO instant at which a BC calendar day ("YYYY-MM-DD") begins.
export function startOfDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d);
  const guess = wallAsUtc - offsetAt(wallAsUtc);
  return new Date(wallAsUtc - offsetAt(guess)).toISOString();
}

// ISO instant at which the BC day *after* the given one begins -- use with
// `.lt()` to make an end date inclusive of its whole day.
export function startOfNextDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return startOfDay(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10));
}
