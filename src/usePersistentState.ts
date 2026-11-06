import { useEffect, useState } from "react";

/** useState that remembers its value in localStorage (per browser). */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        const parsed = JSON.parse(stored) as T;
        // Merge objects so newly added fields get their defaults.
        return typeof initial === "object" && initial && !Array.isArray(initial) ? { ...initial, ...parsed } : parsed;
      }
    } catch {
      // Storage unavailable or corrupt: fall back to the default.
    }
    return initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota/private-mode errors.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
