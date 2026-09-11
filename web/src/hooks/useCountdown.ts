"use client";
import { useEffect, useState } from "react";

/// Client-side tick between chain reads. `unlocksAt` is a unix second.
export function useCountdown(unlocksAt?: number) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 250);
    return () => clearInterval(id);
  }, []);
  if (!unlocksAt) return 0;
  return Math.max(0, unlocksAt - now);
}
