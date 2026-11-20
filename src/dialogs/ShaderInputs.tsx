import { Button, CopyButton, Group, Table, Text, Title, Tooltip, UnstyledButton } from '@mantine/core';

import AppModal from '../app/AppModal';
import { usePhone } from '../app/usePhone';

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
  {name: "iFrame", type: "int", description: "The frame number, counting from 0. See below for when it restarts."},
  {name: "iPrevFrame", type: "sampler2D", description: "The frame drawn just before this one."},
  {name: "iTexture0", last: "iTexture7", type: "sampler2D", description: "The 8 images set in the Textures tab."},
  {name: "iFloat0", last: "iFloat15", type: "float", description: "The 16 numbers animated on the timeline."},
];

function Name({name, last}: {name: string; last?: string}) {
  return (
    <CopyButton value={name} timeout={1200}>
      {({copied, copy}) =>
        <Tooltip label={copied ? "Copied" : "Copy " + name} openDelay={copied ? 0 : 400} opened={copied || undefined}>
          <UnstyledButton className="inputName" onClick={copy}>
            <code>{name}</code>{last && <> … <code>{last}</code></>}
          </UnstyledButton>
        </Tooltip>}
    </CopyButton>
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
      </Text>

      <Title order={2} size="h5" mt="lg" mb={4}>Coming from Shadertoy</Title>
      <Text size="sm">
        Shaders are GLSL ES 3.00 (WebGL 2). smoothstep adds the version, precision and these inputs before your
        code. Shadertoy's <code>iChannel0</code>, <code>iMouse</code> and <code>iDate</code> don't exist here:
        use <code>iTexture0</code> for <code>iChannel0</code>.
      </Text>
      <Group justify="flex-end" mt="lg"><Button variant="default" onClick={onHide}>Close</Button></Group>
    </AppModal>
  );
}
