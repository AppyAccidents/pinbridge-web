import { exportToKml } from '../kml';

describe('exportToKml', () => {
  it('generates valid KML for places with coordinates', async () => {
    const blob = exportToKml(
      [
        { title: 'Park', address: '123 St', latitude: 40.78, longitude: -73.96, notes: 'Nice' },
        { title: 'Tower', latitude: 48.85, longitude: 2.29 },
      ],
      'My Export'
    );
    expect(blob.type).toBe('application/vnd.google-earth.kml+xml');
    const text = await blob.text();
    expect(text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(text).toContain('<name>My Export</name>');
    expect(text).toContain('<name>Park</name>');
    expect(text).toContain('<coordinates>-73.96,40.78,0</coordinates>');
    expect(text).toContain('<address>123 St</address>');
    expect(text).toContain('<description>123 St — Nice</description>');
  });

  it('omits coordinate/address/description elements when empty', async () => {
    const blob = exportToKml([{ title: 'Bare Place' }], 'Test');
    const text = await blob.text();
    expect(text).toContain('<name>Bare Place</name>');
    expect(text).not.toContain('<Point>');
    expect(text).not.toContain('<address>');
    expect(text).not.toContain('<description>');
  });

  it('XML-escapes special characters', async () => {
    const blob = exportToKml(
      [{ title: 'A & B <place>', address: '"Quoted"', latitude: 0, longitude: 0 }],
      'Escape & Test'
    );
    const text = await blob.text();
    expect(text).toContain('A &amp; B &lt;place&gt;');
    expect(text).toContain('&quot;Quoted&quot;');
    expect(text).toContain('Escape &amp; Test');
  });

  it('handles PlaceLike with name/lat/lng fields', async () => {
    const blob = exportToKml([{ name: 'MapSwitch Place', lat: 10, lng: 20 } as any], 'Compat');
    const text = await blob.text();
    expect(text).toContain('<name>MapSwitch Place</name>');
    expect(text).toContain('<coordinates>20,10,0</coordinates>');
  });

  it('round-trips with KML parser', async () => {
    const { parseKml } = await import('../../parsers/kml');
    const original = [
      { title: 'Place A', address: 'Addr A', latitude: 10, longitude: 20, notes: 'Note A' },
      { title: 'Place B', latitude: 30, longitude: 40 },
    ];
    const blob = exportToKml(original, 'RoundTrip');
    const kmlText = await blob.text();
    const parsed = parseKml(kmlText, 'roundtrip.kml');
    expect(parsed.places).toHaveLength(2);
    expect(parsed.places[0].title).toBe('Place A');
    expect(parsed.places[0].latitude).toBe(10);
    expect(parsed.places[1].title).toBe('Place B');
  });
});
