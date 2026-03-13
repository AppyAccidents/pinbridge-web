import { parseFile } from '../index';

// jsdom's File does not implement .text(); polyfill it for these tests.
if (typeof File !== 'undefined' && !File.prototype.text) {
  File.prototype.text = function (): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

function makeFile(content: string, name: string, type = ''): File {
  return new File([content], name, { type });
}

const sampleGeoJson = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Test Place' }, geometry: { type: 'Point', coordinates: [10, 20] } },
  ],
});

const sampleKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document><Placemark><name>KML Place</name><Point><coordinates>10,20,0</coordinates></Point></Placemark></Document>
</kml>`;

const sampleCsv = `title,address,latitude,longitude
Test Place,123 Main St,40.7128,-74.0060`;

describe('parseFile', () => {
  it('routes .geojson to GeoJSON parser', async () => {
    const result = await parseFile(makeFile(sampleGeoJson, 'places.geojson'));
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('Test Place');
  });

  it('routes .json to GeoJSON parser', async () => {
    const result = await parseFile(makeFile(sampleGeoJson, 'data.json'));
    expect(result.places).toHaveLength(1);
  });

  it('routes .kml to KML parser', async () => {
    const result = await parseFile(makeFile(sampleKml, 'places.kml'));
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('KML Place');
  });

  // Skipped: parseCsv uses PapaParse which requires FileReaderSync (not in jsdom).
  // CSV parsing is tested directly in csv.test.ts. This test verifies the routing only.
  it.skip('routes .csv to CSV parser', async () => {
    const result = await parseFile(makeFile(sampleCsv, 'places.csv'));
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('Test Place');
  });

  it('content-sniffs JSON when extension is unknown', async () => {
    const result = await parseFile(makeFile(sampleGeoJson, 'data.xyz'));
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('Test Place');
  });

  it('content-sniffs XML when extension is unknown', async () => {
    const result = await parseFile(makeFile(sampleKml, 'data.xyz'));
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('KML Place');
  });

  // Skipped: same FileReaderSync limitation as .csv routing test
  it.skip('falls back to CSV for unknown content', async () => {
    const result = await parseFile(makeFile(sampleCsv, 'data.xyz'));
    expect(result.places).toHaveLength(1);
  });
});
