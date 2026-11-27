// Re-renders a component whenever uploaded images are added, deleted or first loaded.
import { useEffect, useReducer } from 'react';

import { onImagesChanged } from '../lib/localStore';

export function useImagesChanged(): number {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onImagesChanged(bump), []);
  return version;
}
