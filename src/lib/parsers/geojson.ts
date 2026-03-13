import type { ParsedPlace, ImportError } from '@/types';
import { deriveListName } from './utils';

export function parseGeoJson(
  content: string,
  fileName: string
): { places: ParsedPlace[]; errors: ImportError[] } {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return { places: [], errors: [{ reason: 'Invalid JSON file.' }] };
  }

  if (Array.isArray(data)) {
    data = { type: 'FeatureCollection', features: data };
  } else if (typeof data === 'object' && data !== null && (data as Record<string, unknown>).type === 'Feature') {
    data = { type: 'FeatureCollection', features: [data] };
  }

  const obj = data as Record<string, unknown>;
  if (obj.type !== 'FeatureCollection' || !Array.isArray(obj.features)) {
    return { places: [], errors: [{ reason: 'Not a recognized GeoJSON format.' }] };
  }

  const defaultListName = deriveListName(fileName);
  const places: ParsedPlace[] = [];

  for (const feature of obj.features as Record<string, unknown>[]) {
    const geometry = feature.geometry as Record<string, unknown> | undefined;
    if (!geometry || geometry.type !== 'Point') continue;
    const coords = geometry.coordinates as number[] | undefined;
    if (!coords || coords.length < 2) continue;
    const lng = coords[0];
    const lat = coords[1];
    const props = (feature.properties || {}) as Record<string, unknown>;
    const locationObj = props.location as Record<string, unknown> | undefined;
    const title = (props.name as string) || (props.title as string) || (props.Title as string) || 'Unnamed Place';
    const address = (props.address as string) || (locationObj?.address as string) || '';
    const notes = (props.note as string) || (props.comment as string) || (props.description as string) || undefined;
    const sourceUrl = (props.url as string) || (props.google_maps_url as string) || (props['Google Maps URL'] as string) || undefined;
    const listName = (props.list as string) || defaultListName;

    places.push({
      title,
      address,
      latitude: isFinite(lat) ? lat : undefined,
      longitude: isFinite(lng) ? lng : undefined,
      notes: notes || undefined,
      sourceUrl: sourceUrl || undefined,
      listName,
    });
  }

  return { places, errors: [] };
}
