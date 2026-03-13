export type PlaceLike = {
  title?: string;
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  notes?: string;
  note?: string;
  sourceUrl?: string;
  url?: string;
};

export function getPlaceName(place: PlaceLike): string {
  return place.title || place.name || '';
}

export function getPlaceAddress(place: PlaceLike): string {
  return place.address || '';
}

export function getPlaceLat(place: PlaceLike): number | undefined {
  const lat = place.latitude ?? place.lat;
  return lat != null && isFinite(lat) ? lat : undefined;
}

export function getPlaceLng(place: PlaceLike): number | undefined {
  const lng = place.longitude ?? place.lng;
  return lng != null && isFinite(lng) ? lng : undefined;
}

export function getPlaceNotes(place: PlaceLike): string {
  return place.notes || place.note || '';
}

export function getPlaceSourceUrl(place: PlaceLike): string {
  return place.sourceUrl || place.url || '';
}

function buildQuery(place: PlaceLike): string {
  const parts: string[] = [];
  const name = getPlaceName(place);
  const address = getPlaceAddress(place);
  if (name) parts.push(name);
  if (address && address !== name) parts.push(address);
  return parts.join(', ');
}

export function generateAppleMapsUrlForPlace(place: PlaceLike): string {
  const lat = getPlaceLat(place);
  const lng = getPlaceLng(place);
  if (lat != null && lng != null) {
    const params = new URLSearchParams();
    params.set('coordinate', `${lat},${lng}`);
    const name = getPlaceName(place);
    if (name) params.set('name', name);
    return `https://maps.apple.com/place?${params.toString()}`;
  }
  const query = buildQuery(place);
  if (!query) return '';
  return `https://maps.apple.com/search?query=${encodeURIComponent(query)}`;
}

export function generateGoogleMapsUrlForPlace(place: PlaceLike): string {
  const lat = getPlaceLat(place);
  const lng = getPlaceLng(place);
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const query = buildQuery(place);
  if (!query) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
