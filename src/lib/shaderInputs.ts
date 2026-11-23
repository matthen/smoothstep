// The uniforms Renderer.ts declares before each shader's code, for the editor's popups and the
// docs' Reference page.
export interface ShaderInput {
  name: string;
  // The last of a numbered run, like iTexture7 after iTexture0.
  last?: string;
  type: string;
  description: string;
}

export const SHADER_INPUTS: readonly ShaderInput[] = [
  {name: "iTime", type: "float", description: "The time into the animation, in seconds."},
  {name: "iDuration", type: "float", description: "The length of the animation, in seconds."},
  {name: "iResolution", type: "vec2", description: "The size of the frame in pixels. (Shadertoy's is a vec3.)"},
  {name: "iFrame", type: "int", description: "The frame number, counting from 0 at 60 a second. It goes back to 0 " +
    "when you build, when the animation loops or goes back to the start, and when iPrevFrame is cleared."},
  {name: "iPrevFrame", type: "sampler2D", description: "The frame drawn just before this one."},
  {name: "iTexture0", last: "iTexture7", type: "sampler2D", description: "The 8 images set in the Textures tab."},
  {name: "iFloat0", last: "iFloat15", type: "float", description: "The 16 numbers set on the timeline or with sliders."},
  {name: "iBuffer0", last: "iBuffer3", type: "sampler2D",
    description: "What each buffer drew most recently, when the animation has buffers."},
  {name: "iCanvas2D", type: "sampler2D",
    description: "What the Canvas2D layer drew this step, with premultiplied alpha. Transparent without a Canvas2D layer."},
];

// Each input by its own name, with a numbered run listed one by one.
export function eachShaderInput(): {name: string; input: ShaderInput}[] {
  return SHADER_INPUTS.flatMap(input => {
    const first = /^(\D+)(\d+)$/.exec(input.name);
    const last = input.last ? Number(/\d+$/.exec(input.last)![0]) : null;
    if (!first || last === null) {
      return [{name: input.name, input}];
    }
    return Array.from({length: last - Number(first[2]) + 1}, (_, i) => ({name: first[1]! + i, input}));
  });
}
