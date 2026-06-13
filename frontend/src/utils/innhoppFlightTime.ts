const hasFiniteNumber = (value?: number | null) => value !== null && value !== undefined && Number.isFinite(value);

export const computeFlightTimeMinutes = (distanceByAirKm?: number | null, aircraftSpeedKmh?: number | null): number | null => {
  if (!hasFiniteNumber(distanceByAirKm) || (distanceByAirKm as number) < 0) return null;
  if ((distanceByAirKm as number) === 0) return 0;
  if (!hasFiniteNumber(aircraftSpeedKmh) || (aircraftSpeedKmh as number) <= 0) return null;
  return Math.round(((distanceByAirKm as number) / (aircraftSpeedKmh as number)) * 60);
};

export const applyMinimumLoadDuration = (minutes: number | null, minimumLoadDuration?: number | null): number | null => {
  if (minutes == null) return null;
  if (!hasFiniteNumber(minimumLoadDuration) || (minimumLoadDuration as number) <= 0) return minutes;
  return Math.max(minutes, Math.ceil(minimumLoadDuration as number));
};

export const computeDisplayFlightTimeMinutes = (
  distanceByAirKm?: number | null,
  aircraftSpeedKmh?: number | null,
  minimumLoadDuration?: number | null
): number | null => applyMinimumLoadDuration(computeFlightTimeMinutes(distanceByAirKm, aircraftSpeedKmh), minimumLoadDuration);
