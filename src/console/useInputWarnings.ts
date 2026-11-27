// Keeps the Console's input warnings true of the animation as it is: listed after each build that works,
// and brought up to date when its textures or variables change, without waiting for the next build.
import { useEffect, useMemo } from 'react';

import type { TextureSlot, Variable } from '../lib/document';
import { inputWarnings } from './inputWarnings';

// The code of the last build: every shader tab's, and the Canvas2D layer's.
export interface BuiltInputs {
  shaders: string;
  canvas: string | null;
}

// `built` is null when the last build failed or the warnings are off. A new `built` lists them again.
export function useInputWarnings(
  show: (texts: readonly string[]) => void, built: BuiltInputs | null, textures: readonly TextureSlot[],
  variables: readonly Variable[],
) {
  const warnings = useMemo(() => built ? inputWarnings(built.shaders, built.canvas, textures, variables) : [],
    [built, textures, variables]);
  useEffect(() => show(warnings), [show, warnings]);
}
