// The canvas container's width, height and offset within the pane, where the play bar is placed.
import { useEffect, useState, type RefObject } from 'react';

export function useContainerSize(containerRef: RefObject<HTMLDivElement | null>): [number, number, number] {
  const [container, setContainer] = useState<[number, number, number]>([0, 0, 0]);
  useEffect(() => {
    const element = containerRef.current!;
    // A hidden canvas (the bottom panel taking the screen above a tablet's keyboard) keeps its size,
    // so its simulation carries on when it comes back.
    const observer = new ResizeObserver(() => {
      if (element.clientWidth > 0 && element.clientHeight > 0) {
        setContainer([element.clientWidth, element.clientHeight, element.offsetTop]);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);
  return container;
}
