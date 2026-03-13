import Papa from 'papaparse';
import type { ParsedPlace, ImportError } from '@/types';

export interface CsvRow {
  [key: string]: string;
}

/**
 * Parse a CSV file into place objects
 */
export async function parseCsv(file: File): Promise<{
  places: ParsedPlace[];
  errors: ImportError[];
}> {
  return new Promise((resolve) => {
    const places: ParsedPlace[] = [];
    const errors: ImportError[] = [];

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        results.data.forEach((row, index) => {
          try {
            const place = parseCsvRow(row, index + 2); // +2 for header row + 1-indexed
            if (place) {
              places.push(place);
            }
          } catch (error) {
            errors.push({
              row: index + 2,
              reason: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        });

        resolve({ places, errors });
      },
      error: (error) => {
        errors.push({ reason: `CSV parse error: ${error.message}` });
        resolve({ places, errors });
      },
    });
  });
}

/**
 * Parse a single CSV row into a ParsedPlace
 */
function parseCsvRow(row: CsvRow, rowNumber: number): ParsedPlace | null {
  // Try common column names for title
  const title =
    row['title'] ||
    row['Title'] ||
    row['name'] ||
    row['Name'] ||
    row['place'] ||
    row['Place'];

  if (!title) {
    throw new Error('Missing title/name');
  }

  // Try common column names for address
  const address =
    row['address'] ||
    row['Address'] ||
    row['location'] ||
    row['Location'] ||
    row['formatted_address'] ||
    '';

  // Try to parse coordinates
  let latitude: number | undefined;
  let longitude: number | undefined;

  const latStr =
    row['latitude'] || row['Latitude'] || row['lat'] || row['Lat'];
  const lngStr =
    row['longitude'] ||
    row['Longitude'] ||
    row['lng'] ||
    row['Lng'] ||
    row['lon'] ||
    row['Lon'];

  if (latStr && lngStr) {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (!isNaN(lat) && !isNaN(lng)) {
      latitude = lat;
      longitude = lng;
    }
  }

  // Try common column names for other fields
  const notes = row['notes'] || row['Notes'] || row['Note'] || row['note'] || row['description'] || row['Description'] || row['Comment'] || row['comment'] || '';
  const tagsStr = row['tags'] || row['Tags'] || row['categories'] || row['Categories'] || '';
  const tags = tagsStr
    ? tagsStr
        .split(/[,;|]/)
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const sourceUrl = row['sourceUrl'] || row['url'] || row['URL'] || row['link'] || '';

  return {
    title,
    address,
    latitude,
    longitude,
    notes: notes || undefined,
    tags,
    sourceUrl: sourceUrl || undefined,
  };
}

/**
 * Export places to CSV format
 */
export function exportToCsv(
  places: Array<{
    id: string;
    title: string;
    address: string;
    latitude?: number;
    longitude?: number;
    tags: string[];
    notes?: string;
    source: string;
    sourceUrl?: string;
    createdAt: Date;
    updatedAt: Date;
  }>,
  collections: Map<string, string[]> // placeId -> collection names
): string {
  const rows = places.map((place) => ({
    id: place.id,
    title: place.title,
    address: place.address,
    latitude: place.latitude ?? '',
    longitude: place.longitude ?? '',
    tags: place.tags.join(';'),
    collections: (collections.get(place.id) || []).join(';'),
    notes: place.notes || '',
    source: place.source,
    sourceUrl: place.sourceUrl || '',
    createdAt: place.createdAt.toISOString(),
    updatedAt: place.updatedAt.toISOString(),
  }));

  return Papa.unparse(rows);
}

/**
 * Get CSV template
 */
export function getCsvTemplate(): string {
  return Papa.unparse([
    {
      title: 'Example Place',
      address: '123 Main St, City, Country',
      latitude: '40.7128',
      longitude: '-74.0060',
      tags: 'restaurant;favorite',
      notes: 'Great food!',
    },
  ]);
}
