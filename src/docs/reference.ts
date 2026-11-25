// The Reference page, written at build time from the lists the editor's popups use, so the two
// always agree: the shader inputs, the Canvas2D layer's inputs and helpers, fonts and libraries.
import { CANVAS2D_REFERENCE } from '../editor/canvas2dReference.ts';
import { FONT_FAMILIES } from '../layer/fonts.ts';
import { LIBRARIES } from '../layer/libraries.ts';
import { SHADER_INPUTS } from '../lib/shaderInputs.ts';

// A table cell: inline code where asked, with pipes escaped and lines kept apart.
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
const code = (text: string) => text.split('\n').map(line => '`' + line.replace(/\|/g, '\\|') + '`').join('<br>');

export const REFERENCE_PATH = 'reference.md';

export function referenceMarkdown(): string {
  const inputs = SHADER_INPUTS.map(i =>
    `| \`${i.type}\` | \`${i.name}\`${i.last ? ` … \`${i.last}\`` : ''} | ${cell(i.description)} |`);
  const layerInputs = CANVAS2D_REFERENCE.filter(e => e.kind === 'input').map(e =>
    `| \`${e.type ?? ''}\` | \`${e.name}\` | ${cell(e.oneLiner)} |`);
  const helpers = CANVAS2D_REFERENCE.filter(e => e.kind === 'helper').map(e =>
    `| ${code(e.signatures.join('\n'))} | ${cell(e.oneLiner)} |`);
  const libraries = LIBRARIES.map(l =>
    `| \`${l.example}\` | [${l.title}](${l.url}): ${cell(l.about)} | ${l.licence} |`);

  return `# Reference

Everything your code can use, in one place: the inputs every shader has, and the Canvas2D layer's
inputs, drawing helpers, fonts and libraries. [Coding specification](coding-specification.md) and
[The Canvas2D layer](canvas2d.md) explain them, with examples.

## Shader inputs

Your shader sets the colour of each pixel in a \`mainImage\` function:

\`\`\`glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(1.0, 0.0, 0.0, 1.0);
}
\`\`\`

\`fragCoord\` is the pixel's position, from (0, 0) at the bottom left to \`iResolution\` at the top right.
Set \`fragColor\` to its colour, with red, green and blue from 0 to 1. The alpha is always 1.

| type | name | what it is |
|---|---|---|
${inputs.join('\n')}

### Textures

\`texture(iTexture0, uv)\` reads a texture's colour at \`uv\`, which runs from 0 to 1 across the texture with
(0, 0) at the bottom left. \`fragCoord / iResolution\` fills the frame with it. Textures repeat outside 0 to 1.

### iPrevFrame and iFrame

\`iPrevFrame\` is a texture like the others, so you can read the last frame and build on it, for trails or
simulations. It starts black, and is cleared each time you build, the canvas changes size or a texture
changes. \`iFrame\` goes back to 0 then too, and when the animation loops or goes back to the start, so
\`if (iFrame == 0)\` is the place to set things up. While it plays, \`iPrevFrame\`, \`iFrame\` and the
buffers move on 60 times a second, whatever the screen's refresh rate or the export's frame rate, so a
simulation runs at the same speed everywhere.

### Buffers and shared code

The ⊕ above the code adds a buffer, the Canvas2D layer or shared GLSL code. A buffer is another shader that
draws before the image each frame. Every tab can read what it drew as \`iBuffer0\`, \`iBuffer1\` and so on.
The tabs go in the order they draw, so reading an earlier buffer gives this frame's picture, and reading
the same buffer or a later one gives the last frame's. Buffers hold any numbers, not just colours, in all
four channels, so they can run simulations.

Functions, constants and \`#define\`s in the shared.glsl tab, which ⊕ adds, can be used in every shader tab.

### Coming from Shadertoy

Shaders are GLSL ES 3.00 (WebGL 2). smoothstep.io adds the version, precision and these inputs before
your code. Shadertoy's \`iChannel0\`, \`iMouse\` and \`iDate\` don't exist here: use \`iTexture0\` for
\`iChannel0\`, and \`iBuffer0\` to \`iBuffer3\` for buffers.

## Canvas2D layer

The Canvas2D layer is JavaScript that draws on a 2D canvas, on the same 60-a-second steps as the buffers.
Its tab comes first, so every shader reads this step's drawing as \`iCanvas2D\`. With "Draw over the image"
on, the drawing also goes over the image.

\`\`\`js
// Runs after each build and restart. Optional; what it returns is data.
function setup({width, height, resolution, duration, floats, textures}) {
  return {};
}

function draw(ctx, {time, frame, duration, width, height, resolution, floats, textures, data}) {
  clear(ctx);
  ctx.fillText("Hello", 60, 110);
}
\`\`\`

The canvas is 1080 units tall whatever its real size, with y down from the top left. It keeps what's drawn
until you \`clear(ctx)\`. Variables outside the functions keep their values between steps.

| type | name | what it is |
|---|---|---|
${layerInputs.join('\n')}

### Drawing helpers

\`drawList\` draws nested lists of commands with y up from -1 to 1, like a shader's uv.

| helper | what it does |
|---|---|
${helpers.join('\n')}

### Fonts

Text can use ${FONT_FAMILIES.slice(0, -1).join(', ')} and ${FONT_FAMILIES.at(-1)}, as in
\`ctx.font = "600 64px Inter"\`.

### Libraries

Import a library on its own line at the top of the code.

| import | library | licence |
|---|---|---|
${libraries.join('\n')}

Click a helper, an input or a \`ctx\` method in the code to see what it does.
`;
}
