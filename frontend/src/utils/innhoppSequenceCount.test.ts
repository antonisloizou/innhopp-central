import { describe, expect, it } from 'vitest';
import { getInnhoppSequenceCount } from './innhoppSequenceCount';

describe('getInnhoppSequenceCount', () => {
  it('uses the highest sequence number rather than the number of entries', () => {
    expect(getInnhoppSequenceCount([{ sequence: 1 }, { sequence: 4 }, { sequence: 2 }])).toBe(4);
  });

  it('returns zero when no valid sequence number is present', () => {
    expect(getInnhoppSequenceCount([{ sequence: null }, {}])).toBe(0);
  });
});
