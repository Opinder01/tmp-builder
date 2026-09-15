// Mirrors api/_lib/overtime.js — first 8h regular, next 3h (8-11) overtime,
// anything past 11h doubletime. Per shift only, never combined across two
// shifts in the same day.
export function splitShiftHours(totalHours) {
  const hours = Number(totalHours) || 0;
  const regular = Math.min(hours, 8);
  const overtime = Math.min(Math.max(hours - 8, 0), 3);
  const doubletime = Math.max(hours - 11, 0);
  return { regular, overtime, doubletime };
}
