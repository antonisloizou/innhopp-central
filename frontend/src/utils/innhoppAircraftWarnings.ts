import type { AircraftPricingModel, Innhopp } from '../api/events';

type AircraftWarningSource = {
  id?: number;
  pricing_model: AircraftPricingModel;
  slot_pricing_bands?: {
    max_distance_km: number;
  }[];
};

const hasNumber = (value?: number | null) => value !== null && value !== undefined && Number.isFinite(value);

export const getInnhoppAircraftWarning = (
  innhopp: Pick<Innhopp, 'aircraft_id' | 'distance_by_air'>,
  aircraftList: AircraftWarningSource[]
): string | null => {
  if (!hasNumber(innhopp.aircraft_id)) {
    return 'No aircraft assigned.';
  }

  const aircraft = aircraftList.find((item) => item.id === innhopp.aircraft_id) || null;
  if (!aircraft) {
    return 'Assigned aircraft is no longer attached to this event.';
  }

  if (aircraft.pricing_model !== 'slot') {
    return null;
  }

  const bands = [...(aircraft.slot_pricing_bands || [])]
    .filter((band) => hasNumber(band.max_distance_km))
    .sort((a, b) => a.max_distance_km - b.max_distance_km);

  if (!hasNumber(innhopp.distance_by_air) || bands.length === 0) {
    return null;
  }

  const highestBand = bands[bands.length - 1];
  if (innhopp.distance_by_air! > highestBand.max_distance_km) {
    return 'Distance exceeds the highest slot band; last band will be used.';
  }

  return null;
};
