import type { PlaceLike } from './url';
import { getPlaceName, getPlaceAddress, getPlaceLat, getPlaceLng, getPlaceNotes } from './url';

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function exportToKml(places: PlaceLike[], documentName: string): Blob {
  const placemarks = places.map((place) => {
    const name = getPlaceName(place) || 'Unnamed Place';
    const address = getPlaceAddress(place);
    const notes = getPlaceNotes(place);
    const lat = getPlaceLat(place);
    const lng = getPlaceLng(place);
    const descParts: string[] = [];
    if (address) descParts.push(address);
    if (notes) descParts.push(notes);
    const description = descParts.join(' — ');
    const hasCoords = lat != null && lng != null;

    return `    <Placemark>
      <name>${escapeXml(name)}</name>${description ? `\n      <description>${escapeXml(description)}</description>` : ''}${address ? `\n      <address>${escapeXml(address)}</address>` : ''}${hasCoords ? `\n      <Point><coordinates>${lng},${lat},0</coordinates></Point>` : ''}
    </Placemark>`;
  }).join('\n');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
${placemarks}
  </Document>
</kml>`;
  return new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
}
