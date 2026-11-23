import { Button, Group, Table, Text, Title, Tooltip, UnstyledButton } from '@mantine/core';

import AppModal from '../app/AppModal';
import CopyText from '../app/CopyText';
import { usePhone } from '../app/usePhone';
import { CANVAS2D_REFERENCE } from '../editor/canvas2dReference';
import { FONT_FAMILIES } from '../layer/fonts';
import { LIBRARIES } from '../layer/libraries';
import { DOCS_URL } from '../lib/config';

interface ShaderInputsProps {
  show: boolean;
  onHide(): void;
}

// The uniforms Renderer.ts declares before the shader's code. Keep in step with
// docs/coding-specification.md.
const INPUTS: {name: string; last?: string; type: string; description: string}[] = [
  {name: "iTime", type: "float", description: "The time into the animation, in seconds."},
  {name: "iDuration", type: "float", description: "The length of the animation, in seconds."},
  {name: "iResolution", type: "vec2", description: "The size of the frame in pixels. (Shadertoy's is a vec3.)"},
  {name: "iFrame", type: "int", description: "The frame number, counting from 0 at 60 a second. See below for when it restarts."},
  {name: "iPrevFrame", type: "sampler2D", description: "The frame drawn just before this one."},
  {name: "iTexture0", last: "iTexture7", type: "sampler2D", description: "The 8 images set in the Textures tab."},
  {name: "iFloat0", last: "iFloat15", type: "float", description: "The 16 numbers set on the timeline or with sliders."},
  {name: "iBuffer0", last: "iBuffer3", type: "sampler2D",
    description: "What each buffer drew most recently, when the animation has buffers."},
  {name: "iCanvas2D", type: "sampler2D",
    description: "What the Canvas2D layer drew this step, with premultiplied alpha. Transparent without a Canvas2D layer."},
];

// The Canvas2D layer's, as the editor explains them.
const LAYER_INPUTS = CANVAS2D_REFERENCE.filter(entry => entry.kind === "input");
const LAYER_HELPERS = CANVAS2D_REFERENCE.filter(entry => entry.kind === "helper");

function Name({name, last}: {name: string; last?: string}) {
  return (
    <CopyText value={name} timeout={1200}>
      {({copied, copy}) =>
        <Tooltip label={copied ? "Copied" : "Copy " + name} openDelay={copied ? 0 : 400} opened={copied || undefined}>
          <UnstyledButton className="inputName" onClick={copy}>
            <code>{name}</code>{last && <> … <code>{last}</code></>}
          </UnstyledButton>
        </Tooltip>}
    </CopyText>
  );
}

export default function ShaderInputs({show, onHide}: ShaderInputsProps) {
  const phone = usePhone();
  return (
    <AppModal
      opened={show} onClose={onHide} title="Shader inputs" size="lg" fullScreen={phone}
      classNames={{body: "helpReference"}}
    >
      <Text size="sm" mb="xs">
        Your shader sets the colour of each pixel in a <code>mainImage</code> function:
      </Text>
      <pre className="codeBlock">{
        "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n" +
        "  fragColor = vec4(1.0, 0.0, 0.0, 1.0);\n" +
        "}"
      }</pre>
      <Text size="sm" mb="lg">
        <code>fragCoord</code> is the pixel's position, from (0, 0) at the bottom left to <code>iResolution</code> at
        the top right. Set <code>fragColor</code> to its colour, with red, green and blue from 0 to 1. The alpha is
        always 1.
      </Text>

      <Title order={2} size="h5" mb={4}>Inputs</Title>
      <Text size="sm" c="dimmed" mb="xs">Click a name to copy it.</Text>
      <Table className="inputTable" verticalSpacing={6}>
        <Table.Tbody>
          {INPUTS.map(input =>
            <Table.Tr key={input.name}>
              <Table.Td className="inputType"><code>{input.type}</code></Table.Td>
              <Table.Td className="inputNameCell"><Name name={input.name} last={input.last} /></Table.Td>
              <Table.Td>{input.description}</Table.Td>
            </Table.Tr>,
          )}
        </Table.Tbody>
      </Table>

      <Title order={2} size="h5" mt="lg" mb={4}>Textures</Title>
      <Text size="sm">
        <code>texture(iTexture0, uv)</code> reads a texture's colour at <code>uv</code>, which runs from 0 to 1
        across the image with (0, 0) at the bottom left. <code>fragCoord / iResolution</code> fills the frame with
        it. Textures repeat outside 0 to 1.
      </Text>

      <Title order={2} size="h5" mt="lg" mb={4}>iPrevFrame and iFrame</Title>
      <Text size="sm">
        <code>iPrevFrame</code> is a texture like the others, so you can read the last frame and build on it,
        for trails or simulations. It starts black, and is cleared each time you build, the canvas changes size or
        a texture changes. <code>iFrame</code> goes back to 0 then too, and when the animation loops or goes
        back to the start, so <code>if (iFrame == 0)</code> is the place to set things up.
        While it plays, <code>iPrevFrame</code>, <code>iFrame</code> and the buffers move on 60 times a second, whatever the
        screen's refresh rate or the export's frame rate, so a simulation runs at the same speed everywhere.
      </Text>

      <Title order={2} size="h5" mt="lg" mb={4}>Buffers and shared code</Title>
      <Text size="sm">
        The ⊕ above the code adds a buffer or the Canvas2D layer. A buffer is another shader that draws before
        the image each frame. Every
        tab can read what it drew as <code>iBuffer0</code>, <code>iBuffer1</code> and so on. The tabs go in the
        order they draw, so reading an earlier buffer gives this frame's picture, and reading the same buffer or a
        later one gives the last frame's. Buffers hold any numbers, not just colours, in all four channels, so
        they can run simulations.
      </Text>
      <Text size="sm" mt="xs">
        Functions, constants and <code>#define</code>s in the Shared GLSL tab can be used in every shader tab.
      </Text>

      <Title order={2} size="h5" mt="lg" mb={4}>Canvas2D layer</Title>
      <Text size="sm" mb="xs">
        The Canvas2D layer is JavaScript that draws on a 2D canvas, on the same 60-a-second steps as the buffers.
        Its tab comes first, so every shader reads this step's drawing as <code>iCanvas2D</code>. With "Draw over
        the image" on, the drawing also goes over the image.
      </Text>
      <pre className="codeBlock">{
        "// Runs after each build and restart. Optional; what it returns is data.\n" +
        "function setup({width, height, duration, floats, textures}) {\n" +
        "  return {};\n" +
        "}\n\n" +
        "function draw(ctx, {time, frame, duration, width, height, floats, textures, data}) {\n" +
        "  clear(ctx);\n" +
        "  ctx.fillText(\"Hello\", 60, 110);\n" +
        "}"
      }</pre>
      <Text size="sm" mb="xs">
        The canvas is 1080 units tall whatever its real size, with y down from the top left. It keeps what's drawn
        until you <code>clear(ctx)</code>. Variables outside the functions keep their values between steps. Fonts:
        {" "}{FONT_FAMILIES.join(", ")}.
      </Text>
      <Table className="inputTable" verticalSpacing={6}>
        <Table.Tbody>
          {LAYER_INPUTS.map(input =>
            <Table.Tr key={input.name}>
              <Table.Td className="inputType"><code>{input.type}</code></Table.Td>
              <Table.Td className="inputNameCell"><Name name={input.name} /></Table.Td>
              <Table.Td>{input.oneLiner}</Table.Td>
            </Table.Tr>,
          )}
        </Table.Tbody>
      </Table>

      <Title order={3} size="h6" mt="md" mb={4}>Drawing helpers</Title>
      <Text size="sm" mb="xs">
        <code>drawList</code> draws nested lists of commands with y up from -1 to 1, like a shader's uv.
      </Text>
      <Table className="inputTable" verticalSpacing={6}>
        <Table.Tbody>
          {LAYER_HELPERS.map(helper =>
            <Table.Tr key={helper.name}>
              <Table.Td className="inputSignature"><code>{helper.signatures.join("\n")}</code></Table.Td>
              <Table.Td>{helper.oneLiner}</Table.Td>
            </Table.Tr>,
          )}
        </Table.Tbody>
      </Table>

      <Title order={3} size="h6" mt="md" mb={4}>Libraries</Title>
      <Text size="sm" mb="xs">Import a library on its own line at the top of the code.</Text>
      <Table className="inputTable" verticalSpacing={6}>
        <Table.Tbody>
          {LIBRARIES.map(library =>
            <Table.Tr key={library.name}>
              <Table.Td className="inputSignature"><code>{library.example}</code></Table.Td>
              <Table.Td>
                <a href={library.url} target="_blank" rel="noreferrer">{library.title}</a>: {library.about}
              </Table.Td>
            </Table.Tr>,
          )}
        </Table.Tbody>
      </Table>
      <Text size="sm" mt="xs">
        Click a helper, an input or a <code>ctx</code> method in the code to see what it does.{" "}
        <a href={DOCS_URL + "/canvas2d.md"} target="_blank" rel="noreferrer">The Canvas2D layer</a> in the docs has
        examples and more about each helper.
      </Text>

      <Title order={2} size="h5" mt="lg" mb={4}>Coming from Shadertoy</Title>
      <Text size="sm">
        Shaders are GLSL ES 3.00 (WebGL 2). smoothstep.io adds the version, precision and these inputs before
        your code. Shadertoy's <code>iChannel0</code>, <code>iMouse</code> and <code>iDate</code> don't exist here:
        use <code>iTexture0</code> for <code>iChannel0</code>, and <code>iBuffer0</code> to <code>iBuffer3</code> for
        buffers.
      </Text>
      <Group justify="flex-end" mt="lg"><Button variant="default" onClick={onHide}>Close</Button></Group>
    </AppModal>
  );
}
