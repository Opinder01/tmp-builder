// Shown in push notifications so a flagger can see which shift it's about
// without opening the app. Formatted in Pacific time explicitly -- Vercel's
// serverless functions run in UTC by default, which would otherwise show the
// wrong local time for a BC-based crew.
export function shiftSummary({ job_number, location, start_time }) {
  const when = new Date(start_time).toLocaleString("en-US", {
    timeZone: "America/Vancouver",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${job_number ? `Job ${job_number} — ` : ""}${location} — ${when}`;
}
