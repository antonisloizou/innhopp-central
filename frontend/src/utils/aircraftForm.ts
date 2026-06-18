import type { AircraftPricingModel, AircraftSlotPricingBand, AircraftSlotPricingBandInput } from '../api/events';

export const normalizeAircraftFormBands = (
  _pricingModel: AircraftPricingModel,
  bands?: AircraftSlotPricingBand[] | AircraftSlotPricingBandInput[] | null
): AircraftSlotPricingBandInput[] => {
  return Array.isArray(bands)
    ? bands.map((band, index) => ({
        id: band.id,
        max_distance_km: band.max_distance_km,
        slot_multiplier: band.slot_multiplier,
        sort_order: band.sort_order ?? index
      }))
    : [];
};
