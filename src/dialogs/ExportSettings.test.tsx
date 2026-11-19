import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ExportSettings, { parseFps, parseWidth } from './ExportSettings';
import type { ExportOptions, ExportProgress } from './exportTypes';

afterEach(cleanup);

function renderExport(options: ExportOptions, progress: ExportProgress | null = null, error: string | null = null) {
  const props = {
    show: true, options, onOptionsChange: vi.fn(), onExport: vi.fn(), onCancel: vi.fn(), progress, error,
  };
  const result = render(<ExportSettings {...props} />);
  return {props, rerender: (p: Partial<typeof props>) => result.rerender(<ExportSettings {...props} {...p} />)};
}

const GIF: ExportOptions = {width: 640, fps: 30, type: "gif"};

describe("ExportSettings", () => {
  it("parses widths and frame rates", () => {
    expect(parseWidth("641")).toBe(642);
    expect(parseWidth("640")).toBe(640);
    expect(parseWidth("")).toBeNull();
    expect(parseWidth("-2")).toBeNull();
    expect(parseWidth("abc")).toBeNull();
    expect(parseFps("29.6")).toBe(30);
    expect(parseFps("0")).toBeNull();
    expect(parseFps("0.2")).toBeNull();
  });

  it("reports valid values and marks invalid ones without reporting them", () => {
    const {props} = renderExport(GIF);
    const width = screen.getByLabelText("Resolution width");
    fireEvent.change(width, {target: {value: "641"}});
    expect(props.onOptionsChange).toHaveBeenLastCalledWith({...GIF, width: 642});
    expect(width.className).not.toContain("is-invalid");
    fireEvent.change(width, {target: {value: "-4"}});
    expect(width.className).toContain("is-invalid");
    expect(screen.getByRole("button", {name: "Export"}).hasAttribute("disabled")).toBe(true);
    const fps = screen.getByLabelText("Frame rate");
    fireEvent.change(fps, {target: {value: "0"}});
    expect(fps.className).toContain("is-invalid");
    fireEvent.change(fps, {target: {value: "24"}});
    expect(props.onOptionsChange).toHaveBeenCalledTimes(2);
    expect(props.onOptionsChange).toHaveBeenLastCalledWith({...GIF, fps: 24});
  });

  it("changes the file type and warns when video can't be encoded", async () => {
    const {props, rerender} = renderExport(GIF);
    expect(screen.queryByText(/can't encode video/)).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("File type"), "PNG frames (.zip)");
    expect(props.onOptionsChange).toHaveBeenCalledWith({...GIF, type: "png"});
    rerender({options: {...GIF, type: "mp4"}});
    expect(screen.getByText(/can't encode video/)).toBeTruthy();
  });

  it("disables the form and shows progress while exporting", async () => {
    const {props, rerender} = renderExport(GIF, {stage: "rendering", fraction: 0.25});
    expect(screen.getByText("Rendering frames")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0.25");
    expect(screen.getByLabelText("Resolution width").hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", {name: "Export"}).hasAttribute("disabled")).toBe(true);
    rerender({progress: {stage: "encoding", fraction: 0.5}});
    expect(screen.getByText("Encoding.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", {name: "Cancel"}));
    expect(props.onCancel).toHaveBeenCalled();
  });

  it("exports and shows errors", async () => {
    const {props} = renderExport(GIF, null, "Encoding failed.");
    expect(screen.getByText("Encoding failed.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", {name: "Export"}));
    expect(props.onExport).toHaveBeenCalled();
  });
});
