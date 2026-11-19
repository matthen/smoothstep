import { cleanup, screen } from '@testing-library/react';
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

describe("AspectRatioPicker", () => {
  it("reports the picked ratio", async () => {
    const onChange = vi.fn();
    render(<AspectRatioPicker value={[1, 1]} onChange={onChange} top={0} left={0} />);
    await userEvent.selectOptions(screen.getByLabelText("Aspect ratio"), "16:9");
    expect(onChange).toHaveBeenCalledWith([16, 9]);
  });
});
