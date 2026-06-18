import { describe, expect, it } from 'vitest';

import { normalizeAircraftFormBands } from './aircraftForm';

describe('normalizeAircraftFormBands', () => {
  it('leaves missing bands empty so existing aircraft data is not invented in the event form', () => {
    expect(normalizeAircraftFormBands('slot', [])).toEqual([]);
  });

  it('preserves existing slot pricing bands', () => {
    expect(
      normalizeAircraftFormBands('slot', [
        { id: 7, aircraft_id: 3, max_distance_km: 60, slot_multiplier: 1.5, sort_order: 2, created_at: '', updated_at: '' }
      ])
    ).toEqual([{ id: 7, max_distance_km: 60, slot_multiplier: 1.5, sort_order: 2 }]);
  });
});
