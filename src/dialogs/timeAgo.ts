// How long ago an animation was made or last changed, for the Open dialog's list.
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600], ["month", 30 * 24 * 3600], ["week", 7 * 24 * 3600],
  ["day", 24 * 3600], ["hour", 3600], ["minute", 60],
];
const format = new Intl.RelativeTimeFormat("en-US", {numeric: "always"});

// "just now", "5 minutes ago", "2 days ago", like javascript-time-ago's default style.
export function timeAgo(time: number, now: number = Date.now()): string {
  const seconds = (now - time) / 1000;
  if (seconds < 45) {
    return "just now";
  }
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      return format.format(-Math.round(seconds / size), unit);
    }
  }
  return format.format(-1, "minute");
}
