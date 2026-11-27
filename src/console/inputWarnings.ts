// Warnings about inputs the code reads that hold nothing: an empty texture slot, which reads as black or
// null, and an iFloat with no transitions or slider value, which is always 0.
import { EMPTY_TEXTURE, type TextureSlot, type Variable } from '../lib/document';
import { floatsInCode, inputsInCode, layerTexturesInCode } from '../timeline/Sliders';

const isEmpty = (slot: TextureSlot) => slot.url === EMPTY_TEXTURE && !slot.isUserUploaded;

// `shaders` is every shader tab's code, and `canvas` the Canvas2D layer's, if there is one.
export function inputWarnings(
  shaders: string, canvas: string | null, textures: readonly TextureSlot[], variables: readonly Variable[],
): string[] {
  const shaderSlots = inputsInCode(shaders, "iTexture");
  const layerSlots = canvas === null ? [] : layerTexturesInCode(canvas).filter(i => !shaderSlots.includes(i));
  const emptyIn = (slots: number[]) => slots.filter(i => textures[i] !== undefined && isEmpty(textures[i]));
  const unset = floatsInCode(shaders).filter(i => {
    const variable = variables[i];
    return variable !== undefined && variable.transitions.length === 0 && variable.value === undefined;
  });
  return [
    ...emptyIn(shaderSlots).map(i =>
      `iTexture${i} is empty, so it reads as black. Choose an image or video for it in the Textures tab.`),
    ...emptyIn(layerSlots).map(i =>
      `textures[${i}] is empty, so it's null. Choose an image or video for iTexture${i} in the Textures tab.`),
    ...unset.map(i => `iFloat${i} is always 0, since it has no transitions and no value set with its slider. ` +
      "Give it a transition in the Timeline tab, or set it in the Sliders tab."),
  ];
}
