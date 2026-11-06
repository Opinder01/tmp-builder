// Crown Traffic works in British Columbia, so every date/time in the app is
// shown and entered in BC time (Pacific, switching between PST and PDT with
// daylight saving) regardless of where the device is -- e.g. an admin in
// California dispatching "8:00 AM" must show as 8:00 AM to flaggers in BC.
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

// BC's offset from UTC (negative, in ms) at the given instant.
function offsetAt(ms) {
  const p = wallParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// "YYYY-MM-DD" of the BC calendar day an instant falls on.
export function dateKey(value) {
  const p = wallParts(new Date(value).getTime());
  return `${p.year}-${p.month}-${p.day}`;
}

export function todayKey() {
  return dateKey(new Date());
}

// Adds whole days to a "YYYY-MM-DD" key (pure calendar math, no time zone).
export function addDays(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Instant -> value for <input type="datetime-local">, as BC wall-clock time.
export function toInputValue(value) {
  if (!value) return "";
  const p = wallParts(new Date(value).getTime());
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// <input type="datetime-local"> value (BC wall-clock time) -> ISO instant.
export function fromInputValue(local) {
  const [datePart, timePart = "00:00"] = local.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm);
  // Second pass settles the offset when the guess lands across a DST change.
  const guess = wallAsUtc - offsetAt(wallAsUtc);
  return new Date(wallAsUtc - offsetAt(guess)).toISOString();
}

// Instant at which a BC calendar day ("YYYY-MM-DD") begins.
export function startOfDay(key) {
  return fromInputValue(`${key}T00:00`);
}

export function formatDate(value, options) {
  return new Date(value).toLocaleDateString(undefined, { timeZone: APP_TIME_ZONE, ...options });
}

export function formatTime(value, options) {
  return new Date(value).toLocaleTimeString(undefined, { timeZone: APP_TIME_ZONE, ...options });
}

// Date + time with the zone abbreviation (PDT/PST) so there's no ambiguity.
export function formatDateTime(value, options) {
  return new Date(value).toLocaleString(undefined, {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...options,
  });
}
