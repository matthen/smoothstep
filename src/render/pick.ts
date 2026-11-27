// While a picker drags, its literal is swapped for a uniform, so each move sets a value instead of building.
import { parseVec } from '../editor/pickerValues';
import type { ProbeRequest, ShaderId } from './Renderer';

export const PICK_UNIFORM = "smoothstepPick";

export type PickType = "float" | "vec2" | "vec3" | "vec4";

// The literal's place in its tab's code as built, and its type.
export interface Pick {
  tab: ShaderId;
  from: number;
  to: number;
  type: PickType;
}

// The image's code, the buffers' and the code they share.
export interface Sources {
  code: string;
  buffers: readonly string[];
  shared: string;
}

// The type and components of a GLSL literal a picker edits, like 0.5 or vec3(1., 0.5, 0.).
export function pickValue(text: string): {type: PickType; values: number[]} | null {
  const values = parseVec(text);
  if (values) {
    return {type: `vec${values.length}` as PickType, values};
  }
  const value = Number(text);
  return /^-?(\d+\.\d*|\.\d+)$/.test(text) && Number.isFinite(value) ? {type: "float", values: [value]} : null;
}

// Where the literal that is edited[from..to] after a picker's edit sits in `built`, the code before it,
// or null if the code around it differs.
export function pickRange(built: string, edited: string, from: number, to: number): {from: number; to: number} | null {
  const end = built.length - (edited.length - to);
  if (end < from || built.slice(0, from) !== edited.slice(0, from) || built.slice(end) !== edited.slice(to)) {
    return null;
  }
  return {from, to: end};
}

// The code with the literal replaced by the uniform.
function withPick(code: string, pick: {from: number; to: number}): string {
  return code.slice(0, pick.from) + PICK_UNIFORM + code.slice(pick.to);
}

// The tabs' code with the picked literal as the uniform.
export function pickedSources(sources: Sources, pick: Pick | null): Sources {
  if (!pick) {
    return sources;
  }
  const {code, buffers, shared} = sources;
  return {
    code: pick.tab === "image" ? withPick(code, pick) : code,
    buffers: buffers.map((b, i) => pick.tab === i ? withPick(b, pick) : b),
    shared: pick.tab === "shared" ? withPick(shared, pick) : shared,
  };
}

// An expression shown from the picked tab, moved to where it is once the literal is the uniform. A
// request for another tab, or code other than `built`, stays as it is.
export function pickedRequest(request: ProbeRequest, pick: Pick, built: string): ProbeRequest {
  if (request.tab !== pick.tab || request.code !== built) {
    return request;
  }
  const shift = PICK_UNIFORM.length - (pick.to - pick.from);
  const move = (pos: number) => pos >= pick.to ? pos + shift : pos <= pick.from ? pos : null;
  const [from, to] = [move(request.from), move(request.to)];
  // A selection inside the literal can't be shown from the uniform.
  if (from === null || to === null) {
    return request;
  }
  return {...request, code: withPick(request.code, pick), from, to};
}
