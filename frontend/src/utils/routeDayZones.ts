export type RouteDayZonePoint = {
  dayKey?: string;
  dayLabel?: string;
  lat: number;
  lng: number;
};

export type RouteDayZone = {
  key: string;
  label: string;
  color: string;
  path: Array<{ lat: number; lng: number }>;
  labelPosition: { lat: number; lng: number };
  labelRotation: number;
};

// This sequence deliberately stays the same for every event: the first day is
// always blue, the second pink, and so on.
export const routeDayColors = [
  '#2563eb',
  '#db2777',
  '#d97706',
  '#059669',
  '#7c3aed',
  '#dc2626',
  '#0891b2',
  '#4f46e5',
  '#65a30d',
  '#c2410c',
  '#0f766e',
  '#be185d',
  '#4338ca',
  '#b45309',
  '#15803d',
  '#0369a1'
];

type Point = { lat: number; lng: number };

const cross = (origin: Point, a: Point, b: Point) =>
  (a.lng - origin.lng) * (b.lat - origin.lat) - (a.lat - origin.lat) * (b.lng - origin.lng);

const convexHull = (points: Point[]) => {
  const sorted = [...points].sort((a, b) => a.lng - b.lng || a.lat - b.lat);
  if (sorted.length <= 2) return sorted;
  const lower: Point[] = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  });
  const upper: Point[] = [];
  [...sorted].reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  });
  return lower.slice(0, -1).concat(upper.slice(0, -1));
};

const paddedBounds = (points: Point[]) => {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    latPadding: Math.max((maxLat - minLat) * 0.25, 0.08),
    lngPadding: Math.max((maxLng - minLng) * 0.25, 0.1)
  };
};

const distanceSquared = (a: Point, b: Point) => {
  const longitudeScale = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const latDelta = a.lat - b.lat;
  const lngDelta = (a.lng - b.lng) * longitudeScale;
  return latDelta * latDelta + lngDelta * lngDelta;
};

const bufferedMarkerHull = (points: Point[], padding: { latPadding: number; lngPadding: number }) => {
  const vertices = points.flatMap((point) =>
    Array.from({ length: 8 }, (_, index) => {
      const angle = (index * Math.PI * 2) / 8;
      return {
        lat: point.lat + Math.sin(angle) * padding.latPadding,
        lng: point.lng + Math.cos(angle) * padding.lngPadding
      };
    })
  );
  return convexHull(vertices);
};

const longestEdgeLabelCandidates = (path: Point[], centre: Point, padding: { latPadding: number; lngPadding: number }) => {
  let start = path[0];
  let end = path[1];
  let longestLength = -1;
  path.forEach((point, index) => {
    const next = path[(index + 1) % path.length];
    const length = distanceSquared(point, next);
    if (length > longestLength) {
      start = point;
      end = next;
      longestLength = length;
    }
  });

  const latitude = (start.lat + end.lat) / 2;
  const longitudeScale = Math.cos(latitude * (Math.PI / 180));
  const edgeLat = end.lat - start.lat;
  const edgeLng = (end.lng - start.lng) * longitudeScale;
  const edgeLength = Math.hypot(edgeLat, edgeLng) || 1;
  let normalLat = -edgeLng / edgeLength;
  let normalLng = edgeLat / edgeLength;
  const midpoint = { lat: latitude, lng: (start.lng + end.lng) / 2 };
  const towardsCentre = (centre.lat - midpoint.lat) * normalLat + (centre.lng - midpoint.lng) * longitudeScale * normalLng;
  if (towardsCentre > 0) {
    normalLat *= -1;
    normalLng *= -1;
  }
  const offset = 0;
  let rotation = (-Math.atan2(edgeLat, edgeLng) * 180) / Math.PI;
  if (rotation > 90) rotation -= 180;
  if (rotation < -90) rotation += 180;

  return [0.06, 0.14, 0.22, 0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.78, 0.86, 0.94].map((ratio) => {
    const anchor = {
      lat: start.lat + edgeLat * ratio,
      lng: start.lng + (edgeLng * ratio) / longitudeScale
    };
    return {
      lat: anchor.lat + normalLat * offset,
      lng: anchor.lng + (normalLng * offset) / longitudeScale,
      anchor,
      rotation
    };
  });
};

/** Creates a padded multi-corner envelope for every scheduled day's stops. */
export const buildRouteDayZones = (points: RouteDayZonePoint[]): RouteDayZone[] => {
  const groups = new Map<string, RouteDayZonePoint[]>();
  points.forEach((point) => {
    if (!point.dayKey || point.dayKey === 'unscheduled') return;
    groups.set(point.dayKey, [...(groups.get(point.dayKey) || []), point]);
  });

  const zones = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, dayPoints], index) => {
    const uniquePoints = Array.from(
      new Map(dayPoints.map((point) => [`${point.lat.toFixed(6)},${point.lng.toFixed(6)}`, point])).values()
    );
    const bounds = paddedBounds(uniquePoints);
    const centre = { lat: (bounds.minLat + bounds.maxLat) / 2, lng: (bounds.minLng + bounds.maxLng) / 2 };
    const path = bufferedMarkerHull(uniquePoints, bounds);

    return {
      key,
      label: uniquePoints[0].dayLabel || key,
      color: routeDayColors[index % routeDayColors.length],
      path,
      candidates: longestEdgeLabelCandidates(path, centre, bounds)
    };
  });

  const markerPositions = points.map(({ lat, lng }) => ({ lat, lng }));
  const chosenLabels: Point[] = [];
  return zones.map((zone) => {
    const candidate = [...zone.candidates]
      .sort((a, b) => {
        const score = (point: Point) => {
          const markerClearance = Math.min(...markerPositions.map((marker) => distanceSquared(point, marker)));
          const labelSeparation =
          chosenLabels.length === 0
            ? Math.min(...zones.filter((other) => other.key !== zone.key).map((other) => distanceSquared(point, other.candidates[1])))
            : Math.min(...chosenLabels.map((other) => distanceSquared(point, other)));
          return { markerClearance, labelSeparation };
        };
        const scoreA = score(a);
        const scoreB = score(b);
        if (Math.abs(scoreB.markerClearance - scoreA.markerClearance) > 0.000001) {
          return scoreB.markerClearance - scoreA.markerClearance;
        }
        return scoreB.labelSeparation - scoreA.labelSeparation;
      })[0];
    chosenLabels.push(candidate);
    return {
      key: zone.key,
      label: zone.label,
      color: zone.color,
      path: zone.path,
      labelPosition: candidate,
      labelRotation: candidate.rotation
    };
  });
};
