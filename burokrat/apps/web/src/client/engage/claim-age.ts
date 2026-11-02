import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

/** How long ago `since` was, to the minute, such as `2h 10m`; "" if never. */
export function formatAge(since: number, now: number) {
  if (!since) return "";
  const minutes = Math.max(0, Math.floor((now - since) / MINUTE_MS));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** The time, updated each minute, for ages that stay current on screen. */
export function useMinuteClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
