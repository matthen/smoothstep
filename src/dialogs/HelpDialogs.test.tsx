import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { render } from '../test/render';
import KeyboardShortcuts from './KeyboardShortcuts';
import ShaderInputs from './ShaderInputs';
import { combosFor, keyLabel, SHORTCUTS } from './shortcuts';

afterEach(cleanup);

describe("KeyboardShortcuts", () => {
  it("lists the editor and playback shortcuts with keys", () => {
    render(<KeyboardShortcuts show={true} onHide={() => {}} />);
    const dialog = screen.getByRole("dialog", {name: "Keyboard shortcuts"});
    const build = within(dialog).getByText("Build the code").closest("tr")!;
    expect(build.textContent).toBe("Shift+Enter or Ctrl+EnterBuild the code");
    expect(within(dialog).getByText("Play or pause")).toBeTruthy();
    expect(within(dialog).getByText(/Jump to 0%/).closest("tr")!.textContent).toMatch(/^0 to 9/);
  });

  it("names Mac keys on a Mac", () => {
    const redo = SHORTCUTS[0]!.shortcuts.find(s => s.description === "Redo")!;
    expect(combosFor(redo, true).map(c => c.map(k => keyLabel(k, true)).join("+"))).toEqual(["Shift+⌘+Z"]);
    expect(combosFor(redo, false).map(c => c.map(k => keyLabel(k, false)).join("+"))).toEqual(["Ctrl+Y"]);
  });
});

describe("ShaderInputs", () => {
  it("lists every input, and copies a name when clicked", async () => {
    const user = userEvent.setup();
    render(<ShaderInputs show={true} onHide={() => {}} />);
    const dialog = screen.getByRole("dialog", {name: "Shader inputs"});
    for (const name of ["iTime", "iDuration", "iResolution", "iFrame", "iPrevFrame", "iTexture7", "iFloat15"]) {
      expect(within(dialog).getAllByText(name).length).toBeGreaterThan(0);
    }
    await user.click(within(dialog).getByRole("button", {name: "iPrevFrame"}));
    expect(await navigator.clipboard.readText()).toBe("iPrevFrame");
  });
});
