import { useEffect, useRef, useState } from "react";

/** `value`, changing at most once per `ms`; the latest value always arrives in the end. */
export function useThrottled<T>(value: T, ms: number) {
  const latest = useRef(value);
  const [settled, setSettled] = useState(value);
  const stale = !Object.is(value, settled);

  useEffect(() => {
    latest.current = value;
  }, [value]);

  useEffect(() => {
    if (!stale) return;
    const timer = setTimeout(() => setSettled(latest.current), ms);
    return () => clearTimeout(timer);
  }, [stale, ms]);

  return settled;
}
