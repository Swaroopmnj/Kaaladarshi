import type { CityPreset } from './constants';

export interface IndiaPlaceResult extends CityPreset {
  displayName: string;
}

/**
 * Search any mapped Indian city/town/village using OpenStreetMap Nominatim.
 * IMPORTANT: call only on an explicit Search button click. The public OSMF
 * Nominatim service forbids client-side autocomplete and heavy/systematic use.
 * For production traffic, configure VITE_GEOCODER_URL to a hosted provider or
 * your own Nominatim instance.
 */
export async function searchIndiaPlaces(query: string): Promise<IndiaPlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const base = import.meta.env.VITE_GEOCODER_URL || 'https://nominatim.openstreetmap.org/search';
  const url = new URL(base);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('countrycodes', 'in');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '8');
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Location search failed (${res.status})`);
  const data = await res.json() as Array<{ display_name: string; lat: string; lon: string }>;
  return data.map((x) => ({
    name: x.display_name,
    displayName: x.display_name,
    latitude: Number(x.lat),
    longitude: Number(x.lon),
    timezone: 330,
  })).filter((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude));
}

/**
 * Reverse-geocode a lat/lng (from the browser's Geolocation API) to a place
 * name, for the "Use my current location" button. Same explicit-trigger-only
 * caution as searchIndiaPlaces applies — only call on a user click.
 */
export async function reverseGeocodeIndia(latitude: number, longitude: number): Promise<IndiaPlaceResult> {
  const base = import.meta.env.VITE_GEOCODER_REVERSE_URL || 'https://nominatim.openstreetmap.org/reverse';
  const url = new URL(base);
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('format', 'jsonv2');
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Reverse geocoding failed (${res.status})`);
  const data = await res.json() as { display_name?: string };
  return {
    name: data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    displayName: data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    latitude,
    longitude,
    timezone: 330,
  };
}

/** Wraps the browser Geolocation API in a Promise. Rejects on denial/timeout. */
export function getBrowserLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 600000 });
  });
}
