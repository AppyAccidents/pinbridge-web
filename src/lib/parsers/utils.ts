/**
 * Derive a list name from a filename.
 * Strips extension and normalizes "Saved Places" → "Favorites".
 */
export function deriveListName(fileName: string): string | undefined {
  if (!fileName) return undefined;
  return fileName
    .replace(/\.(csv|json|geojson|kml|kmz|txt|tsv)$/i, '')
    .replace(/^Saved Places?$/i, 'Favorites');
}
