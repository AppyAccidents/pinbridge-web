import type { PlaceLike } from './url';
import { generateAppleMapsUrlForPlace, generateGoogleMapsUrlForPlace } from './url';

export function generateBulkLinks(places: PlaceLike[], target: 'apple' | 'google'): string {
  const generateUrl = target === 'apple' ? generateAppleMapsUrlForPlace : generateGoogleMapsUrlForPlace;
  return places.map((place) => generateUrl(place)).filter(Boolean).join('\n');
}
