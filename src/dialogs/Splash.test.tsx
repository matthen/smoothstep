import { cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '../test/render';
import AspectRatioPicker from './AspectRatioPicker';
import Splash from './Splash';
import { addDocument, clearStore } from './testUtils';

afterEach(cleanup);
beforeEach(clearStore);

describe("Splash", () => {
  it("lists examples and the three most recent animations", async () => {
    for (let i = 0; i < 4; i++) {
      await addDocument("eeee0000000" + i, "Animation " + i, 1000 * i);
    }
    const onHide = vi.fn();
    render(<Splash show={true} onHide={onHide} onTour={() => {}} tourTaken={false} />);
    expect(await screen.findByText("Your recent animations")).toBeTruthy();
    expect(screen.getByRole("link", {name: "Animation 3"}).getAttribute("href")).toBe("#anim/eeee00000003");
    expect(screen.queryByText("Animation 0")).toBeNull();
    const fractals = screen.getByRole("link", {name: /Fractals/});
    expect(fractals.getAttribute("href")).toBe("#example/70bef4ffb215");
    await userEvent.click(fractals);
    expect(onHide).toHaveBeenCalled();
  });

  it("hides recent animations when there are none", async () => {
    render(<Splash show={true} onHide={() => {}} onTour={() => {}} tourTaken={false} />);
    await screen.findByText("Examples");
    expect(screen.queryByText("Your recent animations")).toBeNull();
  });
});

describe("Welcome tip", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows the next tip on each visit, and on Next tip", async () => {
    const tip = () => screen.getByRole("region", {name: "Did you know?"}).textContent ?? "";
    const view = render(<Splash show={true} onHide={() => {}} onTour={() => {}} tourTaken={true} />);
    await screen.findByText("Examples");
    const first = tip();
    expect(first).toMatch(/Click a number/);
    await userEvent.click(screen.getByRole("button", {name: "Next tip"}));
    const second = tip();
    expect(second).not.toBe(first);
    view.unmount();

    render(<Splash show={true} onHide={() => {}} onTour={() => {}} tourTaken={true} />);
    await screen.findByText("Examples");
    expect(tip()).not.toBe(second);
    expect(tip()).not.toBe(first);
  });
});

describe("AspectRatioPicker", () => {
  it("reports the picked ratio", async () => {
    const onChange = vi.fn();
    render(<AspectRatioPicker value={[1, 1]} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Aspect ratio"), "16:9");
    expect(onChange).toHaveBeenCalledWith([16, 9]);
  });

  it("takes a custom ratio, and lists it once chosen", async () => {
    const onChange = vi.fn();
    const {rerender} = render(<AspectRatioPicker value={[1, 1]} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Aspect ratio"), "Custom…");
    fireEvent.change(await screen.findByLabelText("Ratio width"), {target: {value: "21"}});
    fireEvent.change(screen.getByLabelText("Ratio height"), {target: {value: "9"}});
    fireEvent.click(screen.getByRole("button", {name: "Use", hidden: true}));
    expect(onChange).toHaveBeenCalledWith([21, 9]);
    rerender(<AspectRatioPicker value={[21, 9]} onChange={onChange} />);
    expect((screen.getByLabelText("Aspect ratio") as HTMLSelectElement).selectedOptions[0]!.text).toBe("21:9");
  });

  it("won't use a ratio wider than 10:1", async () => {
    render(<AspectRatioPicker value={[1, 1]} onChange={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText("Aspect ratio"), "Custom…");
    fireEvent.change(await screen.findByLabelText("Ratio width"), {target: {value: "11"}});
    expect(screen.getByRole("button", {name: "Use", hidden: true}).hasAttribute("disabled")).toBe(true);
  });
});
