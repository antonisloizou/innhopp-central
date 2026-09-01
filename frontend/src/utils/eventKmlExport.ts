import { Airfield } from '../api/airfields';
import { Accommodation, Event } from '../api/events';
import { Meal, OtherLogistic } from '../api/logistics';
import { parseCoordinates } from './coordinates';

const COMPASS_ALTITUDE_METRES = 3048; // 10,000 ft AGL
const COMPASS_RADIUS_METRES = 3704; // 2 nautical miles

type KmlExportData = {
  event: Event;
  airfields: Airfield[];
  accommodations: Accommodation[];
  meals: Meal[];
  others: OtherLogistic[];
};

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const coordinate = (latitude: number, longitude: number, altitude = 0) => `${longitude.toFixed(6)},${latitude.toFixed(6)},${altitude}`;

const pointPlacemark = (name: string, style: string, latitude: number, longitude: number, description?: string | null) => `
    <Placemark>
      <name>${escapeXml(name)}</name>
      ${description ? `<description>${escapeXml(description)}</description>` : ''}
      <styleUrl>#${style}</styleUrl>
      <Point><altitudeMode>clampToGround</altitudeMode><coordinates>${coordinate(latitude, longitude)}</coordinates></Point>
    </Placemark>`;

const destination = (latitude: number, longitude: number, bearingDegrees: number, distanceMetres: number) => {
  const earthRadiusMetres = 6371008.8;
  const angularDistance = distanceMetres / earthRadiusMetres;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat = (latitude * Math.PI) / 180;
  const lng = (longitude * Math.PI) / 180;
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(angularDistance) + Math.cos(lat) * Math.sin(angularDistance) * Math.cos(bearing));
  const nextLng = lng + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat), Math.cos(angularDistance) - Math.sin(lat) * Math.sin(nextLat));
  return { latitude: (nextLat * 180) / Math.PI, longitude: (((nextLng * 180) / Math.PI + 540) % 360) - 180 };
};

const distanceMetres = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
  const earthRadiusMetres = 6371008.8;
  const latitudeDelta = ((to.lat - from.lat) * Math.PI) / 180;
  const longitudeDelta = ((to.lng - from.lng) * Math.PI) / 180;
  const fromLatitude = (from.lat * Math.PI) / 180;
  const toLatitude = (to.lat * Math.PI) / 180;
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMetres * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const initialLookAt = (points: Array<{ lat: number; lng: number }>) => {
  if (points.length === 0) return '';
  const centre = {
    lat: points.reduce((total, point) => total + point.lat, 0) / points.length,
    lng: points.reduce((total, point) => total + point.lng, 0) / points.length
  };
  const farthestPoint = Math.max(...points.map((point) => distanceMetres(centre, point)));
  const range = Math.max(5000, Math.min(500000, farthestPoint * 3));
  return `
    <LookAt>
      <longitude>${centre.lng.toFixed(6)}</longitude>
      <latitude>${centre.lat.toFixed(6)}</latitude>
      <altitude>0</altitude>
      <range>${range.toFixed(0)}</range>
      <tilt>0</tilt>
      <heading>0</heading>
      <altitudeMode>clampToGround</altitudeMode>
    </LookAt>`;
};

const compassRose = (name: string, latitude: number, longitude: number) => {
  const edge = Array.from({ length: 37 }, (_, index) => destination(latitude, longitude, index * 10, COMPASS_RADIUS_METRES));
  const ringCoordinates = edge.map((point) => coordinate(point.latitude, point.longitude, COMPASS_ALTITUDE_METRES)).join(' ');
  const radials = Array.from({ length: 36 }, (_, index) => {
    const bearing = index * 10;
    const endpoint = edge[index];
    return `
        <Placemark>
          <styleUrl>#compass-radial</styleUrl>
          <LineString><altitudeMode>relativeToGround</altitudeMode><coordinates>${coordinate(latitude, longitude, COMPASS_ALTITUDE_METRES)} ${coordinate(endpoint.latitude, endpoint.longitude, COMPASS_ALTITUDE_METRES)}</coordinates></LineString>
        </Placemark>
        <Placemark>
          <name>${String(bearing).padStart(3, '0')}°</name>
          <styleUrl>#compass-label</styleUrl>
          <Point><altitudeMode>relativeToGround</altitudeMode><coordinates>${coordinate(endpoint.latitude, endpoint.longitude, COMPASS_ALTITUDE_METRES)}</coordinates></Point>
        </Placemark>`;
  }).join('');
  return `
    <Folder>
      <name>${escapeXml(name)}</name>
      <visibility>0</visibility>
      <Placemark>
        <name>10,000 ft compass rose</name>
        <styleUrl>#compass-ring</styleUrl>
        <LineString><tessellate>0</tessellate><altitudeMode>relativeToGround</altitudeMode><coordinates>${ringCoordinates}</coordinates></LineString>
      </Placemark>${radials}
    </Folder>`;
};

const resolveMealCoordinates = (meal: Meal, event: Event, airfields: Airfield[], accommodations: Accommodation[], others: OtherLogistic[]) => {
  if (meal.location_type && meal.location_id) {
    const source = meal.location_type === 'Innhopp'
      ? event.innhopps.find((item) => item.id === meal.location_id)?.coordinates
      : meal.location_type === 'Airfield'
        ? airfields.find((item) => item.id === meal.location_id)?.coordinates
        : meal.location_type === 'Accommodation'
          ? accommodations.find((item) => item.id === meal.location_id)?.coordinates
        : meal.location_type === 'Other'
          ? others.find((item) => item.id === meal.location_id)?.coordinates
          : undefined;
    const parsed = parseCoordinates(source);
    if (parsed) return parsed;
  }
  return parseCoordinates(meal.location);
};

export const createEventKml = ({ event, airfields, accommodations, meals, others }: KmlExportData) => {
  const innhopps = [...event.innhopps].sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
  const eventAirfields = airfields.filter((airfield) => event.airfield_ids.includes(airfield.id));
  const eventMeals = meals.filter((meal) => meal.event_id === event.id);
  const eventOthers = others.filter((other) => other.event_id === event.id);
  const viewPoints = [
    ...innhopps.map((innhopp) => parseCoordinates(innhopp.coordinates)),
    ...eventAirfields.map((airfield) => parseCoordinates(airfield.coordinates)),
    ...accommodations.map((accommodation) => parseCoordinates(accommodation.coordinates)),
    ...eventMeals.map((meal) => resolveMealCoordinates(meal, event, airfields, accommodations, eventOthers)),
    ...eventOthers.map((other) => parseCoordinates(other.coordinates))
  ].filter((point): point is { lat: number; lng: number } => point !== null);
  const overview = initialLookAt(viewPoints);
  let locationCount = 0;

  type TimelineEntry = { scheduledAt?: string | null; name: string; content: string };
  const timeline: TimelineEntry[] = [];
  const compassRoses: string[] = [];
  const usedAirfieldIDs = new Set<number>();

  innhopps.forEach((innhopp) => {
    const parsed = parseCoordinates(innhopp.coordinates);
    if (!parsed) return;
    locationCount += 1;
    const name = `${innhopp.sequence ? `#${innhopp.sequence} ` : ''}${innhopp.name || 'Innhopp'}`;
    const associatedAirfields = [
      { id: innhopp.takeoff_airfield_id, label: 'Takeoff' },
      { id: innhopp.landing_airfield_id, label: 'Landing' }
    ].flatMap(({ id, label }) => {
      const airfield = airfields.find((item) => item.id === id);
      const coordinates = parseCoordinates(airfield?.coordinates);
      if (!airfield || !coordinates) return [];
      usedAirfieldIDs.add(airfield.id);
      locationCount += 1;
      return [pointPlacemark(`${label}: ${airfield.name}`, 'airfield', coordinates.lat, coordinates.lng, airfield.description)];
    }).join('');
    timeline.push({ scheduledAt: innhopp.scheduled_at, name, content: `${associatedAirfields}${pointPlacemark(name, 'innhopp', parsed.lat, parsed.lng, innhopp.notes)}` });
    compassRoses.push(compassRose(name, parsed.lat, parsed.lng));
  });
  eventMeals.forEach((meal) => {
    const parsed = resolveMealCoordinates(meal, event, airfields, accommodations, eventOthers);
    if (!parsed) return;
    locationCount += 1;
    timeline.push({ scheduledAt: meal.scheduled_at, name: meal.name, content: pointPlacemark(meal.name, 'meal', parsed.lat, parsed.lng, meal.notes) });
  });
  eventOthers.forEach((other) => {
    const parsed = parseCoordinates(other.coordinates);
    if (!parsed) return;
    locationCount += 1;
    timeline.push({ scheduledAt: other.scheduled_at, name: other.name, content: pointPlacemark(other.name, 'other', parsed.lat, parsed.lng, other.description || other.notes) });
  });
  accommodations.forEach((accommodation) => {
    const parsed = parseCoordinates(accommodation.coordinates);
    if (!parsed) return;
    locationCount += 1;
    timeline.push({
      scheduledAt: accommodation.check_in_at || accommodation.check_out_at,
      name: accommodation.name,
      content: pointPlacemark(accommodation.name, 'accommodation', parsed.lat, parsed.lng, accommodation.notes)
    });
  });
  const unassignedAirfieldPlacemarks = eventAirfields.filter((airfield) => !usedAirfieldIDs.has(airfield.id)).map((airfield) => {
    const parsed = parseCoordinates(airfield.coordinates);
    if (!parsed) return '';
    locationCount += 1;
    return pointPlacemark(airfield.name, 'airfield', parsed.lat, parsed.lng, airfield.description);
  }).join('');
  const timelinePlacemarks = timeline
    .sort((a, b) => {
      const aTime = a.scheduledAt ? Date.parse(a.scheduledAt) : Number.POSITIVE_INFINITY;
      const bTime = b.scheduledAt ? Date.parse(b.scheduledAt) : Number.POSITIVE_INFINITY;
      return (Number.isNaN(aTime) ? Number.POSITIVE_INFINITY : aTime) - (Number.isNaN(bTime) ? Number.POSITIVE_INFINITY : bTime) || a.name.localeCompare(b.name);
    })
    .map((entry) => entry.content)
    .join('');

  return {
    locationCount,
    content: `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <NetworkLinkControl>
    <flyToView>1</flyToView>${overview}
  </NetworkLinkControl>
  <Document>
    <name>${escapeXml(event.name)} — Innhopp map</name>
    <open>1</open>${overview}
    <Style id="innhopp"><IconStyle><Icon><href>https://earth.google.com/earth/document/icon?color=d32f2f&amp;id=2243&amp;scale=4</href></Icon><hotSpot x="64" y="128" xunits="pixels" yunits="insetPixels"/></IconStyle></Style>
    <Style id="airfield"><IconStyle><Icon><href>https://earth.google.com/earth/document/icon?color=1976d2&amp;id=2011&amp;scale=4</href></Icon><hotSpot x="64" y="128" xunits="pixels" yunits="insetPixels"/></IconStyle></Style>
    <Style id="accommodation"><IconStyle><Icon><href>https://earth.google.com/earth/document/icon?color=fbc02d&amp;id=2174&amp;scale=4</href></Icon><hotSpot x="64" y="128" xunits="pixels" yunits="insetPixels"/></IconStyle></Style>
    <Style id="meal"><IconStyle><Icon><href>https://earth.google.com/earth/document/icon?color=d32f2f&amp;id=2130&amp;scale=4</href></Icon><hotSpot x="64" y="128" xunits="pixels" yunits="insetPixels"/></IconStyle></Style>
    <Style id="other"><IconStyle><Icon><href>https://earth.google.com/earth/document/icon?color=9c27b0&amp;id=2000&amp;scale=4</href></Icon><hotSpot x="64" y="128" xunits="pixels" yunits="insetPixels"/></IconStyle></Style>
    <Style id="compass-ring"><LineStyle><color>c0ffffff</color><width>2</width></LineStyle></Style>
    <Style id="compass-radial"><LineStyle><color>90ffffff</color><width>1</width></LineStyle></Style>
    <Style id="compass-label"><LabelStyle><color>ffffffff</color><scale>0.8</scale></LabelStyle><IconStyle><scale>0</scale></IconStyle></Style>
    ${timelinePlacemarks}${unassignedAirfieldPlacemarks}
    <Folder><name>Compass Roses</name><visibility>1</visibility>${compassRoses.join('')}</Folder>
  </Document>
</kml>`
  };
};
