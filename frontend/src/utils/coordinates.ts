export type ParsedCoordinates = {
  lat: number;
  lng: number;
};

const dmsRegex = /(\d{1,3})[°º]\s*(\d{1,2})['’]\s*(\d{1,2}(?:\.\d+)?)["”]?\s*([NSEW])/i;

const parseSingleDms = (value: string): number | null => {
  const match = value.trim().match(dmsRegex);
  if (!match) return null;
  const [, degStr, minStr, secStr, hemiRaw] = match;
  const deg = Number(degStr);
  const min = Number(minStr);
  const sec = Number(secStr);
  const hemi = hemiRaw.toUpperCase();
  if (Number.isNaN(deg) || Number.isNaN(min) || Number.isNaN(sec)) return null;
  const decimal = deg + min / 60 + sec / 3600;
  return hemi === 'S' || hemi === 'W' ? -decimal : decimal;
};

export const parseCoordinates = (raw?: string | null): ParsedCoordinates | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  const dmsMatches = Array.from(trimmed.matchAll(new RegExp(dmsRegex.source, 'ig')));
  if (dmsMatches.length >= 2) {
    const first = parseSingleDms(dmsMatches[0][0]);
    const second = parseSingleDms(dmsMatches[1][0]);
    if (first == null || second == null) return null;
    const firstHemi = dmsMatches[0][4].toUpperCase();
    const secondHemi = dmsMatches[1][4].toUpperCase();
    if ((firstHemi === 'N' || firstHemi === 'S') && (secondHemi === 'E' || secondHemi === 'W')) {
      return { lat: first, lng: second };
    }
    if ((firstHemi === 'E' || firstHemi === 'W') && (secondHemi === 'N' || secondHemi === 'S')) {
      return { lat: second, lng: first };
    }
    return { lat: first, lng: second };
  }

  const parts = trimmed.includes(',') ? trimmed.split(',') : trimmed.split(/\s+/);
  if (parts.length < 2) return null;
  const lat = Number(parts[0].trim());
  const lng = Number(parts[1].trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};
