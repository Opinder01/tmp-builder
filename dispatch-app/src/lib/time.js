// Client-side preview of hours worked, matching the DB's generated column
// (round(extract(epoch from (end - start)) / 3600 - break_minutes / 60, 2)).
// The DB value is always the source of truth for anything billed/paid.
export function calculateHours(startTime, endTime, breakMinutes = 0) {
  if (!startTime || !endTime) return null;
  const start = new Date(startTime);
  const end = new Date(endTime);
  const hours = (end - start) / 1000 / 3600 - breakMinutes / 60;
  if (!Number.isFinite(hours) || hours < 0) return null;
  return Math.round(hours * 100) / 100;
}
