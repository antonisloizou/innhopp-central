import html2canvas from 'html2canvas';
import { googleMapsApiKey, hasConfiguredGoogleMapsApiKey } from '../config/google';

let googleMapsLoader: Promise<any> | null = null;

export const loadGoogleMapsApi = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser.'));
  }
  if ((window as any).google?.maps) {
    return Promise.resolve((window as any).google.maps);
  }
  if (!hasConfiguredGoogleMapsApiKey) {
    return Promise.reject(new Error('Google Maps API key is not configured.'));
  }
  if (googleMapsLoader) return googleMapsLoader;

  googleMapsLoader = new Promise((resolve, reject) => {
    const callbackName = '__innhoppInitGoogleMapsInnhoppExport';
    (window as any)[callbackName] = () => {
      resolve((window as any).google.maps);
      delete (window as any)[callbackName];
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsApiKey)}&v=weekly&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      googleMapsLoader = null;
      delete (window as any)[callbackName];
      reject(new Error('Failed to load Google Maps.'));
    };
    document.head.appendChild(script);
  });

  return googleMapsLoader;
};

export const renderSatelliteMapForExport = async (
  coordinates: { lat: number; lng: number },
  halfWidthMeters: number
): Promise<string> => {
  const maps = await loadGoogleMapsApi();
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:-660px;top:0;width:640px;height:640px;z-index:1;pointer-events:none;background:#fff;';
  document.body.appendChild(host);

  try {
    const map = new maps.Map(host, {
      mapTypeId: 'satellite',
      disableDefaultUI: true,
      gestureHandling: 'none',
      clickableIcons: false,
      keyboardShortcuts: false
    });
    const latDelta = halfWidthMeters / 111320;
    const lngDelta = halfWidthMeters / (111320 * Math.cos((coordinates.lat * Math.PI) / 180));
    const bounds = new maps.LatLngBounds(
      { lat: coordinates.lat - latDelta, lng: coordinates.lng - lngDelta },
      { lat: coordinates.lat + latDelta, lng: coordinates.lng + lngDelta }
    );
    map.fitBounds(bounds, 0);
    new maps.Marker({ map, position: coordinates });
    await new Promise<void>((resolve) => maps.event.addListenerOnce(map, 'tilesloaded', resolve));
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    return (await html2canvas(host, { backgroundColor: '#ffffff', useCORS: true, logging: false })).toDataURL('image/png');
  } finally {
    host.remove();
  }
};
