// What the Canvas2D layer's code can use, for the editor's popups and Help → Shader inputs.
import reference from './canvas2dReference.json';

export interface Canvas2DEntry {
  name: string;
  // setup and draw, the values they're given, the drawing helpers, and the context's own members.
  kind: 'function' | 'input' | 'helper' | 'ctx';
  type?: string;
  oneLiner: string;
  signatures: string[];
  helpUrl?: string;
}

export const CANVAS2D_REFERENCE = reference as Canvas2DEntry[];
