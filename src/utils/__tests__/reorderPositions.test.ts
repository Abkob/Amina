import { describe, it, expect } from 'vitest';
import { reorderPositions } from '../reorderPositions';

describe('reorderPositions', () => {
  it('returns empty map when dragged to same position', () => {
    const result = reorderPositions(['A', 'B', 'C'], 'A', 'A');
    expect(result).toEqual({});
  });

  it('moves second item to first — only changed items returned', () => {
    const result = reorderPositions(['A', 'B', 'C'], 'B', 'A');
    // B moves to 0, A moves to 1, C stays at 2
    expect(result).toEqual({ B: 0, A: 1 });
    expect(result).not.toHaveProperty('C');
  });

  it('moves last item to first', () => {
    const result = reorderPositions(['A', 'B', 'C'], 'C', 'A');
    expect(result).toEqual({ C: 0, A: 1, B: 2 });
  });

  it('moves first item to last', () => {
    const result = reorderPositions(['A', 'B', 'C'], 'A', 'C');
    expect(result).toEqual({ B: 0, C: 1, A: 2 });
  });

  it('swaps two items', () => {
    const result = reorderPositions(['X', 'Y'], 'Y', 'X');
    expect(result).toEqual({ Y: 0, X: 1 });
  });

  it('returns empty map when activeId not in list', () => {
    const result = reorderPositions(['A', 'B'], 'Z', 'A');
    expect(result).toEqual({});
  });

  it('returns empty map when overId not in list', () => {
    const result = reorderPositions(['A', 'B'], 'A', 'Z');
    expect(result).toEqual({});
  });

  it('middle item to end — only two items change', () => {
    const result = reorderPositions(['A', 'B', 'C', 'D'], 'B', 'D');
    // B → 3, C → 1, D → 2; A stays at 0
    expect(result).not.toHaveProperty('A');
    expect(result['B']).toBe(3);
  });

  it('preserves all items in result when all positions shift', () => {
    const ids = ['A', 'B', 'C'];
    const result = reorderPositions(ids, 'C', 'A');
    const allKeys = Object.keys(result);
    // All three should have changed
    expect(allKeys.sort()).toEqual(['A', 'B', 'C']);
  });
});
