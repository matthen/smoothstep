import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { render } from '../test/render';
import AppModal from './AppModal';

afterEach(cleanup);

function Stacked() {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(true);
  return (
    <>
      <AppModal opened={outer} onClose={() => setOuter(false)} title="Outer">outer</AppModal>
      <AppModal opened={inner} onClose={() => setInner(false)} title="Inner">inner</AppModal>
    </>
  );
}

describe("AppModal", () => {
  it("closes only the top modal on Escape", async () => {
    render(<Stacked />);
    expect(screen.getByRole("dialog", {name: "Inner"})).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", {name: "Inner"})).toBeNull();
    expect(screen.getByRole("dialog", {name: "Outer"})).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", {name: "Outer"})).toBeNull();
  });
});
