// Splits ONE shift's total hours into regular/overtime/doubletime, per the
// owner's rule: first 8 hours regular, next 3 hours (8-11) overtime, anything
// past 11 hours doubletime. Applied per shift/timesheet only — two separate
// shifts in the same day are never combined for this calculation.
export function splitShiftHours(totalHours) {
  const hours = Number(totalHours) || 0;
  const regular = Math.min(hours, 8);
  const overtime = Math.min(Math.max(hours - 8, 0), 3);
  const doubletime = Math.max(hours - 11, 0);
  return { regular, overtime, doubletime };
}

// Converts a decimal hours value into whole hours + minutes, for QBO fields
// that want Hours and Minutes separately (e.g. TimeActivity).
export function hoursToHM(decimalHours) {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return { hours, minutes };
}
