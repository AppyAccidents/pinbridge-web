export { parseCsv, exportToCsv, getCsvTemplate } from './csv';
export { parseTakeoutZip, parseTakeoutCsv } from './takeout';
export type { TakeoutParseResult } from './takeout';
export { parseGeoJson } from './geojson';
export { parseKml, parseKmz } from './kml';

import type { ParsedPlace, ImportError } from '@/types';
import { parseCsv } from './csv';
import { parseGeoJson } from './geojson';
import { parseKml, parseKmz } from './kml';

export async function parseFile(file: File): Promise<{
  places: ParsedPlace[];
  errors: ImportError[];
}> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.kmz')) {
    return parseKmz(file, file.name);
  }
  if (name.endsWith('.json') || name.endsWith('.geojson')) {
    const text = await file.text();
    return parseGeoJson(text, file.name);
  }
  if (name.endsWith('.kml')) {
    const text = await file.text();
    return parseKml(text, file.name);
  }
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    return parseCsv(file);
  }

  // Content-sniff fallback
  const text = await file.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseGeoJson(text, file.name);
  }
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<kml')) {
    return parseKml(text, file.name);
  }

  return parseCsv(file);
}
