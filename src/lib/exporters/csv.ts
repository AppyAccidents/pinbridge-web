import type { PlaceLike } from './url';
import { getPlaceName, getPlaceAddress, getPlaceLat, getPlaceLng, getPlaceNotes, getPlaceSourceUrl, generateAppleMapsUrlForPlace, generateGoogleMapsUrlForPlace } from './url';

function escapeCsv(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportQuickCsv(places: PlaceLike[], target: 'apple' | 'google'): Blob {
  const urlLabel = target === 'apple' ? 'Apple Maps URL' : 'Google Maps URL';
  const generateUrl = target === 'apple' ? generateAppleMapsUrlForPlace : generateGoogleMapsUrlForPlace;
  const header = `Name,Address,Latitude,Longitude,Original URL,${urlLabel},Note`;
  const rows = places.map((place) => {
    const lat = getPlaceLat(place);
    const lng = getPlaceLng(place);
    return [
      escapeCsv(getPlaceName(place)), escapeCsv(getPlaceAddress(place)),
      lat ?? '', lng ?? '',
      escapeCsv(getPlaceSourceUrl(place)), escapeCsv(generateUrl(place)), escapeCsv(getPlaceNotes(place)),
    ].join(',');
  });
  return new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
}
