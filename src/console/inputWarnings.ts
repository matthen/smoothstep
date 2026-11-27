// Warnings about inputs the code reads that hold nothing: an empty texture slot, which reads as black or
// null, and an iFloat with no transitions or slider value, which is always 0.
import { EMPTY_TEXTURE, type TextureSlot, type Variable } from '../lib/document';
import { floatsInCode, inputsInCode, layerInputsInCode } from '../timeline/Sliders';

const isEmpty = (slot: TextureSlot) => slot.url === EMPTY_TEXTURE && !slot.isUserUploaded;
const isUnset = (variable: Variable) => variable.transitions.length === 0 && variable.value === undefined;

// The inputs the Canvas2D code reads as `array`[N] that no shader reads too, since the shader's warning covers them.
function layerOnly(canvas: string | null, array: "floats" | "textures", shaderInputs: number[]): number[] {
  return canvas === null ? [] : layerInputsInCode(canvas, array).filter(i => !shaderInputs.includes(i));
}

// `shaders` is every shader tab's code, and `canvas` the Canvas2D layer's, if there is one.
export function inputWarnings(
  shaders: string, canvas: string | null, textures: readonly TextureSlot[], variables: readonly Variable[],
): string[] {
  const shaderSlots = inputsInCode(shaders, "iTexture");
  const shaderFloats = floatsInCode(shaders);
  const emptyIn = (slots: number[]) => slots.filter(i => textures[i] !== undefined && isEmpty(textures[i]));
  const unsetIn = (floats: number[]) => floats.filter(i => variables[i] !== undefined && isUnset(variables[i]));
  return [
    ...emptyIn(shaderSlots).map(i =>
      `iTexture${i} is empty, so it reads as black. Choose an image or video for it in the Textures tab.`),
    ...emptyIn(layerOnly(canvas, "textures", shaderSlots)).map(i =>
      `textures[${i}] is empty, so it's null. Choose an image or video for iTexture${i} in the Textures tab.`),
    ...unsetIn(shaderFloats).map(i => `iFloat${i} is always 0, since it has no transitions and no value set with ` +
      "its slider. Give it a transition in the Timeline tab, or set it in the Sliders tab."),
    ...unsetIn(layerOnly(canvas, "floats", shaderFloats)).map(i =>
      `floats[${i}] is always 0, since iFloat${i} has no transitions. Give iFloat${i} a transition in the Timeline tab.`),
  ];
}
