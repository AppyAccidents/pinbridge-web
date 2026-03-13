import { parseGeoJson } from '../geojson';

describe('parseGeoJson', () => {
  it('parses a valid FeatureCollection with Point features', () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Central Park', address: 'New York, NY' },
          geometry: { type: 'Point', coordinates: [-73.9654, 40.7829] },
        },
        {
          type: 'Feature',
          properties: { title: 'Eiffel Tower', address: 'Paris, France', note: 'Must visit' },
          geometry: { type: 'Point', coordinates: [2.2945, 48.8584] },
        },
      ],
    });
    const result = parseGeoJson(geojson, 'places.geojson');
    expect(result.errors).toHaveLength(0);
    expect(result.places).toHaveLength(2);
    expect(result.places[0]).toMatchObject({
      title: 'Central Park', address: 'New York, NY', latitude: 40.7829, longitude: -73.9654, listName: 'places',
    });
    expect(result.places[1]).toMatchObject({ title: 'Eiffel Tower', notes: 'Must visit', latitude: 48.8584, longitude: 2.2945 });
  });

  it('handles bare JSON array of features', () => {
    const result = parseGeoJson(JSON.stringify([
      { type: 'Feature', properties: { name: 'Place A' }, geometry: { type: 'Point', coordinates: [10, 20] } },
    ]), 'array.json');
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('Place A');
  });

  it('handles standalone Feature object', () => {
    const result = parseGeoJson(JSON.stringify({
      type: 'Feature', properties: { name: 'Solo Place' }, geometry: { type: 'Point', coordinates: [5, 10] },
    }), 'single.geojson');
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('Solo Place');
  });

  it('skips non-Point geometry types', () => {
    const result = parseGeoJson(JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'A Point' }, geometry: { type: 'Point', coordinates: [1, 2] } },
        { type: 'Feature', properties: { name: 'A Line' }, geometry: { type: 'LineString', coordinates: [[1,2],[3,4]] } },
      ],
    }), 'mixed.geojson');
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('A Point');
  });

  it('extracts Google Maps URL fields', () => {
    const result = parseGeoJson(JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'Test', 'Google Maps URL': 'https://maps.google.com/place/123', location: { address: '123 Main St' } },
        geometry: { type: 'Point', coordinates: [0, 0] },
      }],
    }), 'test.json');
    expect(result.places[0].sourceUrl).toBe('https://maps.google.com/place/123');
    expect(result.places[0].address).toBe('123 Main St');
  });

  it('falls back to "Unnamed Place" when no name/title', () => {
    const result = parseGeoJson(JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { address: 'Somewhere' }, geometry: { type: 'Point', coordinates: [1, 2] } }],
    }), 'noname.json');
    expect(result.places[0].title).toBe('Unnamed Place');
  });

  it('returns error for invalid JSON', () => {
    const result = parseGeoJson('not json at all', 'bad.json');
    expect(result.places).toHaveLength(0);
    expect(result.errors[0].reason).toBe('Invalid JSON file.');
  });

  it('returns error for unrecognized JSON structure', () => {
    const result = parseGeoJson(JSON.stringify({ foo: 'bar' }), 'weird.json');
    expect(result.places).toHaveLength(0);
    expect(result.errors[0].reason).toBe('Not a recognized GeoJSON format.');
  });

  it('normalizes listName from filename', () => {
    const geojson = JSON.stringify({ type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { name: 'X' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    ]});
    expect(parseGeoJson(geojson, 'Saved Places.geojson').places[0].listName).toBe('Favorites');
    expect(parseGeoJson(geojson, 'My Trip.json').places[0].listName).toBe('My Trip');
  });

  it('handles features with properties.list as listName', () => {
    const result = parseGeoJson(JSON.stringify({ type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { name: 'X', list: 'Restaurants' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    ]}), 'whatever.json');
    expect(result.places[0].listName).toBe('Restaurants');
  });

  it('handles empty features array', () => {
    const result = parseGeoJson(JSON.stringify({ type: 'FeatureCollection', features: [] }), 'empty.geojson');
    expect(result.places).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
