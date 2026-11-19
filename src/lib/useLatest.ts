import { useLayoutEffect, useRef } from 'react';

// A ref holding the latest value, for callbacks and loops that shouldn't re-subscribe on every change.
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
