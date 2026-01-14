export const metersToFeet = (meters: number) => Math.round(meters * 3.28084);

export const formatMetersWithFeet = (meters?: number | null) => {
  if (meters === null || meters === undefined || Number.isNaN(meters)) return '';
  const feet = metersToFeet(meters);
  return `${meters} m / ${feet} ft`;
};
