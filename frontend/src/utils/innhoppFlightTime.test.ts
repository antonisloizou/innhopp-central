import { describe, expect, it } from 'vitest';

import { applyMinimumLoadDuration, computeDisplayFlightTimeMinutes, computeFlightTimeMinutes } from './innhoppFlightTime';

describe('innhoppFlightTime', () => {
  it('computes flight time from distance and aircraft speed', () => {
    expect(computeFlightTimeMinutes(30, 120)).toBe(15);
  });

  it('returns null when speed is missing for non-zero distances', () => {
    expect(computeFlightTimeMinutes(30, null)).toBeNull();
  });

  it('keeps zero-distance innhopps at zero minutes', () => {
    expect(computeFlightTimeMinutes(0, 120)).toBe(0);
  });

  it('applies minimum load duration when it exceeds computed flight time', () => {
    expect(applyMinimumLoadDuration(12, 15.2)).toBe(16);
  });

  it('keeps computed time when minimum load duration is smaller', () => {
    expect(applyMinimumLoadDuration(18, 15.2)).toBe(18);
  });

  it('computes display flight time for slot-priced aircraft using speed and minimum duration', () => {
    expect(computeDisplayFlightTimeMinutes(15, 180, 8)).toBe(8);
  });

  it('returns raw computed time when no minimum load duration is configured', () => {
    expect(computeDisplayFlightTimeMinutes(45, 180, null)).toBe(15);
  });
});
