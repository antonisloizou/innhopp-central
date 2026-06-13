import { describe, expect, it } from 'vitest';

import { getInnhoppAircraftWarning } from './innhoppAircraftWarnings';

describe('getInnhoppAircraftWarning', () => {
  it('warns when no aircraft is assigned', () => {
    expect(getInnhoppAircraftWarning({ aircraft_id: null, distance_by_air: 25 }, [])).toBe('No aircraft assigned.');
  });

  it('warns when the assigned aircraft is not attached to the event', () => {
    expect(
      getInnhoppAircraftWarning(
        { aircraft_id: 7, distance_by_air: 25 },
        [{ id: 8, pricing_model: 'time' }]
      )
    ).toBe('Assigned aircraft is no longer attached to this event.');
  });

  it('warns when slot-priced aircraft exceed the highest distance band', () => {
    expect(
      getInnhoppAircraftWarning(
        { aircraft_id: 7, distance_by_air: 100 },
        [
          {
            id: 7,
            pricing_model: 'slot',
            slot_pricing_bands: [{ max_distance_km: 20 }, { max_distance_km: 80 }]
          }
        ]
      )
    ).toBe('Distance exceeds the highest slot band; last band will be used.');
  });

  it('does not warn for slot-priced aircraft within configured bands', () => {
    expect(
      getInnhoppAircraftWarning(
        { aircraft_id: 7, distance_by_air: 60 },
        [
          {
            id: 7,
            pricing_model: 'slot',
            slot_pricing_bands: [{ max_distance_km: 20 }, { max_distance_km: 80 }]
          }
        ]
      )
    ).toBeNull();
  });

  it('does not warn for time-priced aircraft with an assignment', () => {
    expect(
      getInnhoppAircraftWarning(
        { aircraft_id: 7, distance_by_air: 120 },
        [{ id: 7, pricing_model: 'time' }]
      )
    ).toBeNull();
  });
});
