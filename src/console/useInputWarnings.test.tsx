import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { emptyTextures, emptyVariables, type TextureSlot, type Variable } from '../lib/document';
import { ConsoleStore } from './consoleStore';
import { useConsoleLog } from './useConsoleLog';
import { useInputWarnings, type BuiltInputs } from './useInputWarnings';

const transition = {startDSecs: 0, endDSecs: 10, startValue: 0, endValue: 1, type: "linear" as const};

interface Props {
  built: BuiltInputs | null;
  textures: TextureSlot[];
  variables: Variable[];
}

// The console after a build of `shaders` that works, with the hooks as the app uses them.
function built(shaders: string, textures: TextureSlot[], variables: Variable[]) {
  const store = new ConsoleStore(undefined, callback => callback());
  const initialProps: Props = {built: null, textures, variables};
  const hook = renderHook(({built, textures, variables}: Props) => {
    const log = useConsoleLog(store, () => false, true);
    useInputWarnings(log.showInputWarnings, built, textures, variables);
    return log;
  }, {initialProps});
  hook.result.current.logBuild(1, {ok: true}, 10);
  const props: Props = {built: {shaders, canvas: null}, textures, variables};
  hook.rerender(props);
  return {
    texts: () => store.getSnapshot().entries.map(entry => entry.text),
    change: (change: Partial<Props>) => hook.rerender({...props, ...change}),
  };
}

describe("useInputWarnings", () => {
  it("drops a warning once the input it's about is set, and adds one when an input is emptied, without a build", () => {
    const variables = emptyVariables();
    variables[1] = {transitions: [transition]};
    const console = built("texture(iTexture0, uv) * iFloat0 * iFloat1", emptyTextures(), variables);
    expect(console.texts()).toEqual(["Built", expect.stringMatching(/^iTexture0 is empty/),
      expect.stringMatching(/^iFloat0 is always 0/)]);

    const textures = emptyTextures();
    textures[0] = {...textures[0]!, url: "photos/a.jpg"};
    console.change({textures});
    expect(console.texts()).toEqual(["Built", expect.stringMatching(/^iFloat0 is always 0/)]);

    const emptied = emptyVariables();
    emptied[0] = {transitions: [transition]};
    console.change({textures, variables: emptied});
    expect(console.texts()).toEqual(["Built", expect.stringMatching(/^iFloat1 is always 0/)]);
  });

  it("lists nothing once the last build failed", () => {
    const console = built("iFloat0", emptyTextures(), emptyVariables());
    expect(console.texts()).toHaveLength(2);
    console.change({built: null});
    expect(console.texts()).toEqual(["Built"]);
  });
});
