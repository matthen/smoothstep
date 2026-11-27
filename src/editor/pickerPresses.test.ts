import { describe, expect, it } from 'vitest';

import { pickerPresses } from './pickerPresses';

function tracked() {
  let releases = 0;
  const presses = pickerPresses(() => { releases++; });
  return { presses, releases: () => releases };
}

describe('pickerPresses', () => {
  it('lets go only when the last of two fingers lifts', () => {
    const { presses, releases } = tracked();
    presses.press(1);
    presses.press(2);
    presses.lift(1);
    expect(releases()).toBe(0);
    presses.lift(2);
    expect(releases()).toBe(1);
  });

  it('lets go once, however many ways a pointer ends', () => {
    const { presses, releases } = tracked();
    presses.press(1);
    presses.lift(1);
    presses.lift(1);
    presses.liftAll();
    expect(releases()).toBe(1);
  });

  it('ignores a pointer that never pressed on it', () => {
    const { presses, releases } = tracked();
    presses.lift(3);
    presses.liftAll();
    expect(releases()).toBe(0);
  });

  it('lets go of every pointer at once, and then counts a new press afresh', () => {
    const { presses, releases } = tracked();
    presses.press(1);
    presses.press(2);
    presses.liftAll();
    expect(releases()).toBe(1);
    presses.press(2);
    presses.lift(2);
    expect(releases()).toBe(2);
  });
});
