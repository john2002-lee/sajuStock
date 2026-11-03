"use client";

import { useEffect, useState } from "react";

/** 값이 delay 동안 멈춘 뒤에만 갱신된다. 도메인 무관 훅. */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
