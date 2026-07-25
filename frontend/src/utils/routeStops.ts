import { parseCoordinates } from './coordinates';
import { ScheduleEntry } from '../components/schedulePreviewTypes';

export type StopVisualType = 'innhopp' | 'accommodation' | 'meal' | 'other' | 'generic';

export type RouteStop = {
  id: string;
  entryId: string;
  label: string;
  coordinates: string;
  visualType: StopVisualType;
};

export type NormalizedRouteStop<T extends { coordinates: string }> = T & {
  lat: number;
  lng: number;
};

const hasText = (value?: string | null) => !!value && value.trim().length > 0;

export const dedupeConsecutiveRouteStops = <T extends { coordinates: string }>(points: T[]) => {
  const deduped: T[] = [];
  points.forEach((point) => {
    const trimmed = point.coordinates.trim();
    if (!trimmed || !parseCoordinates(trimmed)) return;
    if (deduped[deduped.length - 1]?.coordinates !== trimmed) {
      deduped.push({ ...point, coordinates: trimmed });
    }
  });
  return deduped;
};

export const normalizeRouteStops = <T extends { coordinates: string }>(points: T[]): NormalizedRouteStop<T>[] =>
  dedupeConsecutiveRouteStops(points)
    .map((point) => {
      const parsed = parseCoordinates(point.coordinates);
      if (!parsed) return null;
      return {
        ...point,
        lat: parsed.lat,
        lng: parsed.lng
      };
    })
    .filter((point): point is NormalizedRouteStop<T> => !!point);

export const buildScheduleEntryRouteStops = (entry: ScheduleEntry): RouteStop[] => {
  const buildStop = (suffix: string, coordinates: string, label: string, visualType: StopVisualType): RouteStop => ({
    id: `${entry.id}-${suffix}`,
    entryId: entry.id,
    label,
    coordinates: coordinates.trim(),
    visualType
  });

  switch (entry.type) {
    case 'Innhopp':
      return hasText(entry.innhoppCoordinates || entry.coordinates)
        ? [buildStop('point', entry.innhoppCoordinates || entry.coordinates || '', entry.title, 'innhopp')]
        : [];
    case 'Accommodation':
      // An accommodation is a single physical stop. Its check-in is the plotted
      // event; check-out remains visible in the schedule but must not create a
      // second marker (or route point) on any map view.
      if (entry.id.startsWith('acc-out-')) return [];
      return hasText(entry.coordinates) ? [buildStop('point', entry.coordinates || '', entry.title, 'accommodation')] : [];
    case 'Meal':
      return hasText(entry.coordinates) ? [buildStop('point', entry.coordinates || '', entry.title, 'meal')] : [];
    case 'Other':
      return hasText(entry.coordinates) ? [buildStop('point', entry.coordinates || '', entry.title, 'other')] : [];
    default:
      return [];
  }
};
