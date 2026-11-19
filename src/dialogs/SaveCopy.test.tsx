import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SaveCopy, { copyTitle } from './SaveCopy';

afterEach(cleanup);

function renderSaveCopy(title: string) {
  const props = {show: true, title, onSave: vi.fn(), onHide: vi.fn()};
  render(<SaveCopy {...props} />);
  return props;
}

describe("SaveCopy", () => {
  it("appends (copy) once and fits 32 characters", () => {
    expect(copyTitle("Fractals")).toBe("Fractals (copy)");
    expect(copyTitle("Fractals (copy)")).toBe("Fractals (copy)");
    const long = "A very long animation title, abcdefgh";
    expect(copyTitle(long)).toBe(long.slice(0, 25) + " (copy)");
    expect(copyTitle(long).length).toBe(32);
  });

  it("saves the suggested title", async () => {
    const props = renderSaveCopy("Fractals");
    expect((screen.getByLabelText("Title of copy:") as HTMLInputElement).value).toBe("Fractals (copy)");
    await userEvent.click(screen.getByRole("button", {name: "Save copy"}));
    expect(props.onSave).toHaveBeenCalledWith("Fractals (copy)");
    expect(props.onHide).toHaveBeenCalled();
  });

  it("saves a typed title, capped at 32 characters, or the default when empty", async () => {
    const props = renderSaveCopy("Fractals");
    const input = screen.getByLabelText("Title of copy:");
    await userEvent.clear(input);
    await userEvent.type(input, "x".repeat(40));
    expect((input as HTMLInputElement).value).toBe("x".repeat(32));
    await userEvent.click(screen.getByRole("button", {name: "Save copy"}));
    expect(props.onSave).toHaveBeenLastCalledWith("x".repeat(32));
    await userEvent.clear(input);
    await userEvent.type(input, "{Enter}");
    expect(props.onSave).toHaveBeenLastCalledWith("Untitled animation");
  });

  it("cancels", async () => {
    const props = renderSaveCopy("Fractals");
    await userEvent.click(screen.getByRole("button", {name: "Cancel"}));
    expect(props.onHide).toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  });
});
