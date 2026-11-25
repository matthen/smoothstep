import { describe, expect, it } from 'vitest';
import { combineBlocks, describeRange, formatRange, mapToRange, rangeFor } from './probeRange';

describe('combineBlocks', () => {
  it('finds the lowest and highest over the blocks that found values', () => {
    expect(combineBlocks([-2, 1, 1, 0, 0.5, 6, 1, 0, 0, 0, 0, 0])).toEqual([-2, 6]);
  });

  it('skips blocks without values, and non-finite ones', () => {
    expect(combineBlocks([-100, 100, 0, 0, NaN, 3, 1, 0, 1, Infinity, 1, 0, 2, 4, 1, 0])).toEqual([2, 4]);
    expect(combineBlocks([0, 0, 0, 0])).toBeNull();
  });
});

describe('rangeFor', () => {
  it('maps what Auto found to the full 0 to 1', () => {
    const range = rangeFor('auto', [-2, 6]);
    expect(mapToRange(-2, range)).toBe(0);
    expect(mapToRange(6, range)).toBe(1);
    expect(mapToRange(2, range)).toBe(0.5);
  });

  it('keeps the fixed ranges whatever was found', () => {
    expect(mapToRange(0.5, rangeFor('unit', [-2, 6]))).toBe(0.5);
    expect(mapToRange(0, rangeFor('signed', [-2, 6]))).toBe(0.5);
  });

  it('shows a value that never changes as it would from 0 to 1, widened to reach it', () => {
    expect(mapToRange(0.25, rangeFor('auto', [0.25, 0.25]))).toBe(0.25);
    expect(mapToRange(3, rangeFor('auto', [3, 3]))).toBe(1);
    expect(mapToRange(-2, rangeFor('auto', [-2, -2]))).toBe(0);
  });

  it('falls back to 0 to 1 when nothing was found', () => {
    expect(rangeFor('auto', null)).toEqual([0, 1]);
  });
});

describe('formatRange', () => {
  it('rounds both ends to a small part of the gap, without exponents for ordinary sizes', () => {
    expect(formatRange(0.000014, 0.768)).toBe('0 to 0.77');
    expect(formatRange(-3.2, 7.5)).toBe('-3.2 to 7.5');
    expect(formatRange(0, 1200)).toBe('0 to 1200');
    expect(formatRange(-1.99609375, 5.99609375)).toBe('-2 to 6');
  });

  it('keeps the digits that tell close ends apart', () => {
    expect(formatRange(0.5, 0.51)).toBe('0.5 to 0.51');
    expect(formatRange(1000, 1000.5)).toBe('1000 to 1000.5');
  });

  it('writes tiny and huge ends compactly, keeping what tells them apart', () => {
    expect(formatRange(1e-7, 3e-7)).toBe('1e-7 to 3e-7');
    expect(formatRange(1.23e-7, 3.5e-7)).toBe('1.23e-7 to 3.5e-7');
    expect(formatRange(0, 1234567)).toBe('0 to 1.23e6');
  });

  it('never writes minus zero', () => {
    expect(formatRange(-0.001, 2)).toBe('0 to 2');
  });
});

describe('describeRange', () => {
  it('says what Auto found', () => {
    expect(describeRange([0.000014, 0.768])).toBe('0 to 0.77');
    expect(describeRange([0.25, 0.25])).toBe('all 0.25');
    expect(describeRange([0, 0])).toBe('all 0');
    expect(describeRange(null)).toBe('no values');
  });
});
