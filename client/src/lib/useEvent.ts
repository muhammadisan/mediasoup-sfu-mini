import { useEffect, useRef } from "react";
export function useEvent<T extends (...a: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; }, [fn]);
  return ((...args) => ref.current(...args)) as T;
}
