import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { render } from '../test/render';
import PlayerControls from './PlayerControls';
import { Playhead } from './playhead';

afterEach(cleanup);

function renderControls(duration: number) {
  const onDurationChange = vi.fn();
  render(
    <PlayerControls duration={duration} playhead={new Playhead()} isPlaying={false} onSeek={vi.fn()}
      onPlayPause={vi.fn()} onReset={vi.fn()} onDurationChange={onDurationChange} onScrubStart={vi.fn()}
      onScrubEnd={vi.fn()} width={600} top={0} />,
  );
  return {onDurationChange, input: screen.getByLabelText("Duration (seconds)")};
}

describe("DurationInput", () => {
  it("leaves the duration alone when the box is focused and left unchanged", async () => {
    const {onDurationChange, input} = renderControls(5);
    await userEvent.click(input);
    await userEvent.tab();
    expect(onDurationChange).not.toHaveBeenCalled();
  });

  it("passes on a typed duration", async () => {
    const {onDurationChange, input} = renderControls(5);
    await userEvent.clear(input);
    await userEvent.type(input, "8");
    await userEvent.tab();
    expect(onDurationChange).toHaveBeenLastCalledWith(8);
  });
});
